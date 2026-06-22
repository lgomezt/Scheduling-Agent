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
  surveyPayloadForAgent,
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
  information_needs: string;
  conditional_change: string;
  created_at: string;
  updated_at: string;
};

type ModelOutputRow = {
  id: number;
  scenario_id: string;
  scenario_index: number;
  agent_id: string;
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
  reasoning_alignment_score: number;
  comment: string;
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

const hashText = (text: string): string => crypto.createHash("sha256").update(text).digest("hex");

const outputToApi = (scenarioId: string, row: ModelOutputRow) => {
  const scenario = scenarioById(scenarioId);
  const ranking = row.ranking_json ? (JSON.parse(row.ranking_json) as string[]) : [];
  return {
    agentId: row.agent_id,
    ranking: scenario ? labeledRanking(scenario, ranking) : ranking,
    reasoning: row.reasoning ?? "",
    error: row.error,
  };
};

const feedbackToApi = (row: FeedbackRow) => ({
  reasoningAlignmentScore: row.reasoning_alignment_score,
  comment: row.comment,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const scenarioState = (sessionId: string) => {
  const userRows = db
    .prepare("SELECT * FROM scenario_user_responses WHERE session_id = ?")
    .all(sessionId) as UserResponseRow[];
  const userByScenario = new Map(userRows.map((row) => [row.scenario_id, row]));

  const outputRows = db
    .prepare("SELECT * FROM model_scenario_outputs WHERE session_id = ?")
    .all(sessionId) as ModelOutputRow[];
  const outputByScenario = new Map(outputRows.map((row) => [row.scenario_id, row]));

  const feedbackRows = db
    .prepare("SELECT * FROM scenario_agent_feedback WHERE session_id = ?")
    .all(sessionId) as FeedbackRow[];
  const feedbackByScenario = new Map(feedbackRows.map((row) => [row.scenario_id, row]));

  const skipRows = db
    .prepare("SELECT * FROM scenario_skips WHERE session_id = ?")
    .all(sessionId) as SkipRow[];
  const skipByScenario = new Map(skipRows.map((row) => [row.scenario_id, row]));

  return allVisibleScenarios().map((scenario) => {
    const user = userByScenario.get(scenario.id);
    const ranking = user ? (JSON.parse(user.ranking_json) as string[]) : null;
    const output = outputByScenario.get(scenario.id);
    return {
      ...scenario,
      userResponse: user
        ? {
            ranking: labeledRanking(scenario, ranking ?? []),
            otherText: user.other_text,
            reasoning: user.reasoning,
            informationNeeds: user.information_needs,
            conditionalChange: user.conditional_change,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          }
        : null,
      agentOutput: output ? outputToApi(scenario.id, output) : null,
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
    completedScenarioIds: scenarios
      .filter((scenario) => scenario.feedback || scenario.skip)
      .map((scenario) => scenario.id),
    total: scenarios.length,
  });
});

const submitSchema = z.object({
  sessionId: z.string().optional(),
  ranking: z.array(z.string()),
  otherText: z.string().optional(),
  reasoning: z.string().min(1),
  informationNeeds: z.string().min(1),
  conditionalChange: z.string().min(1),
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
    .prepare("SELECT * FROM scenario_agent_feedback WHERE session_id = ?")
    .all(sessionId) as FeedbackRow[];
  const feedbackByScenario = new Map(feedbackRows.map((row) => [row.scenario_id, row]));

  return rows.map((row) => {
    const scenario = scenarioById(row.scenario_id);
    const ranking = JSON.parse(row.ranking_json) as string[];
    return {
      scenario: scenario ? visibleScenario(scenario) : { id: row.scenario_id },
      userRanking: scenario ? labeledRanking(scenario, ranking) : ranking,
      userReasoning: row.reasoning,
      userInformationNeeds: row.information_needs,
      userConditionalChange: row.conditional_change,
      otherText: row.other_text,
      agentFeedback: feedbackByScenario.has(row.scenario_id)
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
  const profile = db
    .prepare("SELECT initial_profile FROM model_profiles WHERE session_id = ?")
    .get(session.id) as { initial_profile: string } | undefined;
  if (!profile) {
    res.status(400).json({ error: "Survey profile is not ready for this session" });
    return;
  }

  db.prepare("DELETE FROM scenario_agent_feedback WHERE session_id = ? AND scenario_id = ?").run(
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
     (session_id, scenario_id, scenario_index, ranking_json, other_text, reasoning,
      information_needs, conditional_change, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(session_id, scenario_id) DO UPDATE SET
       scenario_index = excluded.scenario_index,
       ranking_json = excluded.ranking_json,
       other_text = excluded.other_text,
       reasoning = excluded.reasoning,
       information_needs = excluded.information_needs,
       conditional_change = excluded.conditional_change,
       updated_at = datetime('now')`,
  ).run(
    session.id,
    scenarioId,
    scenarioIndex,
    JSON.stringify(normalized.ranking),
    normalized.otherText,
    parsed.data.reasoning.trim(),
    parsed.data.informationNeeds.trim(),
    parsed.data.conditionalChange.trim(),
  );

  const payload = {
    studyVersion: config.version,
    agent: {
      id: config.agent.id,
      label: config.agent.label,
      description: config.agent.description,
    },
    initialProfile: profile.initial_profile,
    availableQuestionnaireResponses: surveyPayloadForAgent(surveyResponses),
    priorCompletedScenarios: priorResponsesForPrompt(session.id, scenarioIndex),
    currentScenario: visibleScenario(scenario),
  };
  const systemPromptText = loadStudyPrompt(config.agent.scenarioPrompt);
  const callStartedAt = new Date().toISOString();
  const callStarted = Date.now();

  try {
    const result = await generateStudyScenarioRanking({
      promptName: config.agent.scenarioPrompt,
      payload,
    });
    const rankingIds = validateModelRanking(scenario, result.parsed.ranking);
    db.prepare(
      `INSERT INTO model_scenario_outputs
       (session_id, scenario_id, scenario_index, agent_id, ranking_json, reasoning,
        model_name, prompt_name, system_prompt_text, system_prompt_hash,
        prompt_payload_json, raw_output, parsed_output_json, started_at, completed_at, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.id,
      scenarioId,
      scenarioIndex,
      config.agent.id,
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

    res.json({
      ok: true,
      scenarioId,
      agentOutput: {
        agentId: config.agent.id,
        ranking: labeledRanking(scenario, rankingIds),
        reasoning: result.parsed.reasoning,
        error: null,
      },
    });
  } catch (err) {
    db.prepare(
      `INSERT INTO model_scenario_outputs
       (session_id, scenario_id, scenario_index, agent_id, model_name, prompt_name,
        system_prompt_text, system_prompt_hash, prompt_payload_json, started_at,
        completed_at, latency_ms, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.id,
      scenarioId,
      scenarioIndex,
      config.agent.id,
      appConfig.gemini.model,
      config.agent.scenarioPrompt,
      systemPromptText,
      hashText(systemPromptText),
      JSON.stringify(payload),
      callStartedAt,
      new Date().toISOString(),
      Date.now() - callStarted,
      (err as Error).message,
    );
    console.error("Scenario model generation failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
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
  reasoningAlignmentScore: z.number().int().min(1).max(5),
  comment: z.string().min(1),
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

  const output = db
    .prepare(
      "SELECT id FROM model_scenario_outputs WHERE session_id = ? AND scenario_id = ? AND error IS NULL",
    )
    .get(session.id, scenarioId);
  if (!output) {
    res.status(400).json({ error: "Agent output is not ready for this scenario" });
    return;
  }

  db.prepare(
    `INSERT INTO scenario_agent_feedback
     (session_id, scenario_id, scenario_index, reasoning_alignment_score, comment, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(session_id, scenario_id) DO UPDATE SET
       scenario_index = excluded.scenario_index,
       reasoning_alignment_score = excluded.reasoning_alignment_score,
       comment = excluded.comment,
       updated_at = datetime('now')`,
  ).run(
    session.id,
    scenarioId,
    scenarioIndex,
    parsed.data.reasoningAlignmentScore,
    parsed.data.comment.trim(),
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
