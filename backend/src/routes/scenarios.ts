import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { config as appConfig } from "../config.js";
import { getStudyConfig, loadStudyPrompt, scenarioById, scenarioIndexById } from "../study/config.js";
import {
  allVisibleScenarios,
  labeledRanking,
  surveyPayloadForCondition,
  surveyResponsesForSession,
  validateModelRanking,
  validateScenarioRanking,
  visibleScenario,
} from "../study/responses.js";
import { generateStudyScenarioRanking } from "../services/gemini.js";

export const scenariosRouter = Router();

type SessionRow = {
  id: string;
  user_id: number;
  status: string;
  current_scenario_index: number;
  participant_code: string | null;
};

type UserResponseRow = {
  scenario_id: string;
  scenario_index: number;
  ranking_json: string;
  other_text: string | null;
  reasoning: string;
  created_at: string;
  updated_at: string;
};

type ModelOutputRow = {
  id: number;
  scenario_id: string;
  scenario_index: number;
  condition_id: string;
  display_label: "A" | "B";
  ranking_json: string | null;
  reasoning: string | null;
  model_name: string | null;
  prompt_name: string | null;
  system_prompt_text: string | null;
  system_prompt_hash: string | null;
  prompt_payload_json: string;
  raw_output: string | null;
  parsed_output_json: string | null;
  started_at: string | null;
  completed_at: string | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
};

type SkipRow = {
  scenario_id: string;
  scenario_index: number;
  skipped_at: string;
};

type FeedbackRow = {
  scenario_id: string;
  closer_choice: "A" | "B" | "both" | "neither";
  score_a: number;
  score_b: number;
  comment_a: string;
  comment_b: string;
  comparison_comment: string;
  created_at: string;
  updated_at: string;
};

const sessionOwnedBy = (sessionId: string, userId: number): SessionRow | undefined =>
  db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as SessionRow | undefined;

const currentSessionForUser = (userId: number): SessionRow | undefined =>
  db
    .prepare(
      `SELECT * FROM sessions
       WHERE user_id = ? AND status = 'in_progress'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId) as SessionRow | undefined;

const resolveSession = (sessionId: string | undefined, userId: number): SessionRow | undefined =>
  sessionId ? sessionOwnedBy(sessionId, userId) : currentSessionForUser(userId);

const outputToApi = (scenarioId: string, row: ModelOutputRow) => {
  const scenario = scenarioById(scenarioId);
  const ranking = row.ranking_json ? (JSON.parse(row.ranking_json) as string[]) : [];
  return {
    displayLabel: row.display_label,
    ranking: scenario ? labeledRanking(scenario, ranking) : ranking,
    reasoning: row.reasoning ?? "",
    error: row.error,
  };
};

const feedbackToApi = (row: FeedbackRow) => ({
  closerChoice: row.closer_choice,
  scoreA: row.score_a,
  scoreB: row.score_b,
  commentA: row.comment_a,
  commentB: row.comment_b,
  comparisonComment: row.comparison_comment,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const hashText = (text: string): string => crypto.createHash("sha256").update(text).digest("hex");

const scenarioState = (sessionId: string) => {
  const userRows = db
    .prepare("SELECT * FROM scenario_user_responses WHERE session_id = ?")
    .all(sessionId) as UserResponseRow[];
  const userByScenario = new Map(userRows.map((row) => [row.scenario_id, row]));

  const outputRows = db
    .prepare("SELECT * FROM model_scenario_outputs WHERE session_id = ? ORDER BY display_label")
    .all(sessionId) as ModelOutputRow[];
  const outputsByScenario = new Map<string, ModelOutputRow[]>();
  for (const row of outputRows) {
    const arr = outputsByScenario.get(row.scenario_id) ?? [];
    arr.push(row);
    outputsByScenario.set(row.scenario_id, arr);
  }

  const feedbackRows = db
    .prepare("SELECT * FROM scenario_model_feedback WHERE session_id = ?")
    .all(sessionId) as FeedbackRow[];
  const feedbackByScenario = new Map(feedbackRows.map((row) => [row.scenario_id, row]));
  const skipRows = db
    .prepare("SELECT * FROM scenario_skips WHERE session_id = ?")
    .all(sessionId) as SkipRow[];
  const skipByScenario = new Map(skipRows.map((row) => [row.scenario_id, row]));

  return allVisibleScenarios().map((scenario) => {
    const user = userByScenario.get(scenario.id);
    const ranking = user ? (JSON.parse(user.ranking_json) as string[]) : null;
    return {
      ...scenario,
      userResponse: user
        ? {
            ranking: labeledRanking(scenario, ranking ?? []),
            otherText: user.other_text,
            reasoning: user.reasoning,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          }
        : null,
      modelOutputs: (outputsByScenario.get(scenario.id) ?? []).map((row) => outputToApi(scenario.id, row)),
      feedback: feedbackByScenario.has(scenario.id) ? feedbackToApi(feedbackByScenario.get(scenario.id)!) : null,
      skip: skipByScenario.has(scenario.id)
        ? {
            skippedAt: skipByScenario.get(scenario.id)!.skipped_at,
          }
        : null,
    };
  });
};

scenariosRouter.get("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = sessionOwnedBy(sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const scenarios = scenarioState(sessionId);
  res.json({
    scenarios,
    currentScenarioIndex: session.current_scenario_index,
    completedScenarioIds: scenarios.filter((scenario) => scenario.feedback).map((scenario) => scenario.id),
    total: scenarios.length,
  });
});

const submitSchema = z.object({
  sessionId: z.string().optional(),
  ranking: z.array(z.string()),
  otherText: z.string().optional(),
  reasoning: z.string().min(1),
});

const priorResponsesForPrompt = (sessionId: string, scenarioIndex: number) => {
  const rows = db
    .prepare(
      `SELECT * FROM scenario_user_responses
       WHERE session_id = ? AND scenario_index < ?
       ORDER BY scenario_index`,
    )
    .all(sessionId, scenarioIndex) as UserResponseRow[];
  const feedbackRows = db
    .prepare("SELECT * FROM scenario_model_feedback WHERE session_id = ?")
    .all(sessionId) as FeedbackRow[];
  const feedbackByScenario = new Map(feedbackRows.map((row) => [row.scenario_id, row]));

  return rows.map((row) => {
    const scenario = scenarioById(row.scenario_id);
    const ranking = JSON.parse(row.ranking_json) as string[];
    return {
      scenario: scenario ? visibleScenario(scenario) : { id: row.scenario_id },
      userRanking: scenario ? labeledRanking(scenario, ranking) : ranking,
      userReasoning: row.reasoning,
      otherText: row.other_text,
      modelFeedback: feedbackByScenario.has(row.scenario_id)
        ? feedbackToApi(feedbackByScenario.get(row.scenario_id)!)
        : null,
    };
  });
};

scenariosRouter.post("/:scenarioId/submit", requireAuth, async (req, res) => {
  const scenarioId = String(req.params.scenarioId);
  const scenario = scenarioById(scenarioId);
  const scenarioIndex = scenarioIndexById(scenarioId);
  if (!scenario || scenarioIndex < 0) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const session = resolveSession(parsed.data.sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  let normalized: ReturnType<typeof validateScenarioRanking>;
  try {
    normalized = validateScenarioRanking(scenario, parsed.data.ranking, parsed.data.otherText);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const config = getStudyConfig();
  const surveyResponses = surveyResponsesForSession(session.id);
  const profileRows = db
    .prepare("SELECT condition_id, initial_profile FROM model_profiles WHERE session_id = ?")
    .all(session.id) as Array<{ condition_id: string; initial_profile: string }>;
  const profileByCondition = new Map(profileRows.map((row) => [row.condition_id, row.initial_profile]));
  if (profileRows.length !== config.modelConditions.length) {
    res.status(400).json({ error: "Survey profiles are not ready for this session" });
    return;
  }

  db.prepare("DELETE FROM scenario_model_feedback WHERE session_id = ? AND scenario_id = ?").run(
    session.id,
    scenarioId,
  );
  db.prepare("DELETE FROM scenario_skips WHERE session_id = ? AND scenario_id = ?").run(
    session.id,
    scenarioId,
  );
  db.prepare("DELETE FROM model_scenario_outputs WHERE session_id = ? AND scenario_id = ?").run(
    session.id,
    scenarioId,
  );
  db.prepare(
    `INSERT INTO scenario_user_responses
     (session_id, scenario_id, scenario_index, ranking_json, other_text, reasoning, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(session_id, scenario_id) DO UPDATE SET
       scenario_index = excluded.scenario_index,
       ranking_json = excluded.ranking_json,
       other_text = excluded.other_text,
       reasoning = excluded.reasoning,
       updated_at = datetime('now')`,
  ).run(
    session.id,
    scenarioId,
    scenarioIndex,
    JSON.stringify(normalized.ranking),
    normalized.otherText,
    parsed.data.reasoning.trim(),
  );

  const labels = Math.random() < 0.5 ? (["A", "B"] as const) : (["B", "A"] as const);
  const priorResponses = priorResponsesForPrompt(session.id, scenarioIndex);

  let outputs: Array<{
    displayLabel: "A" | "B";
    ranking: ReturnType<typeof labeledRanking>;
    reasoning: string;
    error: null;
  }>;
  try {
    outputs = await Promise.all(
      config.modelConditions.map(async (condition, index) => {
        const displayLabel = labels[index];
        const payload = {
          studyVersion: config.version,
          condition: {
            id: condition.id,
            label: condition.label,
            description: condition.description,
            includedQuestionIds: condition.includedQuestionIds,
          },
          initialProfile: profileByCondition.get(condition.id),
          availableQuestionnaireResponses: surveyPayloadForCondition(condition, surveyResponses),
          priorCompletedScenarios: priorResponses,
          currentScenario: visibleScenario(scenario),
        };
        const systemPromptText = loadStudyPrompt(condition.scenarioPrompt);
        const systemPromptHash = hashText(systemPromptText);
        const callStartedAt = new Date().toISOString();
        const callStarted = Date.now();

        try {
          const result = await generateStudyScenarioRanking({
            promptName: condition.scenarioPrompt,
            payload,
          });
          const rankingIds = validateModelRanking(scenario, result.parsed.ranking);
          db.prepare(
            `INSERT INTO model_scenario_outputs
             (session_id, scenario_id, scenario_index, condition_id, display_label, ranking_json,
              reasoning, model_name, prompt_name, system_prompt_text, system_prompt_hash,
              prompt_payload_json, raw_output, parsed_output_json, started_at, completed_at, latency_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            session.id,
            scenarioId,
            scenarioIndex,
            condition.id,
            displayLabel,
            JSON.stringify(rankingIds),
            result.parsed.reasoning,
            result.modelName,
            result.promptName,
            result.systemPromptText,
            result.systemPromptHash,
            JSON.stringify(result.payload),
            result.raw,
            JSON.stringify(result.parsed),
            result.startedAt,
            result.completedAt,
            result.latencyMs,
          );
          return {
            displayLabel,
            ranking: labeledRanking(scenario, rankingIds),
            reasoning: result.parsed.reasoning,
            error: null,
          };
        } catch (err) {
          db.prepare(
            `INSERT INTO model_scenario_outputs
             (session_id, scenario_id, scenario_index, condition_id, display_label,
              model_name, prompt_name, system_prompt_text, system_prompt_hash,
              prompt_payload_json, started_at, completed_at, latency_ms, error)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            session.id,
            scenarioId,
            scenarioIndex,
            condition.id,
            displayLabel,
            appConfig.gemini.model,
            condition.scenarioPrompt,
            systemPromptText,
            systemPromptHash,
            JSON.stringify(payload),
            callStartedAt,
            new Date().toISOString(),
            Date.now() - callStarted,
            (err as Error).message,
          );
          throw err;
        }
      }),
    );
  } catch (err) {
    console.error("Scenario model generation failed:", err);
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  res.json({
    ok: true,
    scenarioId,
    modelOutputs: outputs.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel)),
  });
});

scenariosRouter.post("/:scenarioId/skip", requireAuth, (req, res) => {
  const scenarioId = String(req.params.scenarioId);
  const scenario = scenarioById(scenarioId);
  const scenarioIndex = scenarioIndexById(scenarioId);
  if (!scenario || scenarioIndex < 0) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  const parsed = z.object({ sessionId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const session = resolveSession(parsed.data.sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const skippedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO scenario_skips (session_id, scenario_id, scenario_index, skipped_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id, scenario_id) DO UPDATE SET
       scenario_index = excluded.scenario_index,
       skipped_at = excluded.skipped_at`,
  ).run(session.id, scenarioId, scenarioIndex, skippedAt);

  const nextIndex = Math.min(scenarioIndex + 1, getStudyConfig().scenarios.length);
  db.prepare(
    `UPDATE sessions
     SET current_scenario_index = CASE
       WHEN current_scenario_index < ? THEN ?
       ELSE current_scenario_index
     END
     WHERE id = ?`,
  ).run(nextIndex, nextIndex, session.id);

  res.json({
    ok: true,
    skippedAt,
    nextScenarioIndex: nextIndex,
    scenariosComplete: nextIndex >= getStudyConfig().scenarios.length,
  });
});

const feedbackSchema = z.object({
  sessionId: z.string().optional(),
  closerChoice: z.enum(["A", "B", "both", "neither"]),
  scoreA: z.number().int().min(1).max(5),
  scoreB: z.number().int().min(1).max(5),
  commentA: z.string().min(1),
  commentB: z.string().min(1),
  comparisonComment: z.string().min(1),
});

scenariosRouter.post("/:scenarioId/feedback", requireAuth, (req, res) => {
  const scenarioId = String(req.params.scenarioId);
  const scenario = scenarioById(scenarioId);
  const scenarioIndex = scenarioIndexById(scenarioId);
  if (!scenario || scenarioIndex < 0) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }

  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const session = resolveSession(parsed.data.sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const outputCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM model_scenario_outputs WHERE session_id = ? AND scenario_id = ? AND error IS NULL",
      )
      .get(session.id, scenarioId) as { n: number }
  ).n;
  if (outputCount !== getStudyConfig().modelConditions.length) {
    res.status(400).json({ error: "Model outputs are not ready for this scenario" });
    return;
  }

  db.prepare(
    `INSERT INTO scenario_model_feedback
     (session_id, scenario_id, scenario_index, closer_choice, score_a, score_b,
      comment_a, comment_b, comparison_comment, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(session_id, scenario_id) DO UPDATE SET
       scenario_index = excluded.scenario_index,
       closer_choice = excluded.closer_choice,
       score_a = excluded.score_a,
       score_b = excluded.score_b,
       comment_a = excluded.comment_a,
       comment_b = excluded.comment_b,
       comparison_comment = excluded.comparison_comment,
       updated_at = datetime('now')`,
  ).run(
    session.id,
    scenarioId,
    scenarioIndex,
    parsed.data.closerChoice,
    parsed.data.scoreA,
    parsed.data.scoreB,
    parsed.data.commentA.trim(),
    parsed.data.commentB.trim(),
    parsed.data.comparisonComment.trim(),
  );

  const nextIndex = Math.min(scenarioIndex + 1, getStudyConfig().scenarios.length);
  db.prepare(
    `UPDATE sessions
     SET current_scenario_index = CASE
       WHEN current_scenario_index < ? THEN ?
       ELSE current_scenario_index
     END
     WHERE id = ?`,
  ).run(nextIndex, nextIndex, session.id);

  res.json({
    ok: true,
    nextScenarioIndex: nextIndex,
    scenariosComplete: nextIndex >= getStudyConfig().scenarios.length,
  });
});
