import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { getStudyConfig } from "../study/config.js";
import {
  labeledRanking,
  surveyPayloadForAgent,
  surveyResponsesForSession,
  visibleScenario,
} from "../study/responses.js";
import { generateStudyFinalProfile } from "../services/gemini.js";

export const reflectionRouter = Router();

type SessionRow = {
  id: string;
  user_id: number;
  status: string;
  current_scenario_index: number;
};

type ProfileRow = {
  agent_id: string;
  initial_profile: string;
  initial_prompt_payload: string;
  initial_raw_output: string;
  final_profile: string | null;
  final_prompt_payload: string | null;
  final_raw_output: string | null;
};

const sessionOwnedBy = (sessionId: string, userId: number): SessionRow | undefined =>
  db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as SessionRow | undefined;

const assertScenarioPhaseComplete = (sessionId: string) => {
  const feedbackCount = (
    db.prepare("SELECT COUNT(*) AS n FROM scenario_agent_feedback WHERE session_id = ?").get(sessionId) as {
      n: number;
    }
  ).n;
  const skipCount = (
    db.prepare("SELECT COUNT(*) AS n FROM scenario_skips WHERE session_id = ?").get(sessionId) as { n: number }
  ).n;
  if (feedbackCount + skipCount !== getStudyConfig().scenarios.length) {
    throw new Error("All scenarios must be completed before the final reflection");
  }
};

const allScenarioEvidence = (sessionId: string) => {
  const userRows = db
    .prepare("SELECT * FROM scenario_user_responses WHERE session_id = ? ORDER BY scenario_index")
    .all(sessionId) as Array<{
    scenario_id: string;
    ranking_json: string;
    other_text: string | null;
    reasoning: string;
    information_needs: string;
    conditional_change: string;
  }>;
  const feedbackRows = db
    .prepare("SELECT * FROM scenario_agent_feedback WHERE session_id = ?")
    .all(sessionId) as Array<{
    scenario_id: string;
    reasoning_alignment_score: number;
    comment: string;
  }>;
  const outputRows = db
    .prepare("SELECT * FROM model_scenario_outputs WHERE session_id = ? ORDER BY scenario_index")
    .all(sessionId) as Array<{
    scenario_id: string;
    agent_id: string;
    ranking_json: string | null;
    reasoning: string | null;
  }>;
  const feedbackByScenario = new Map(feedbackRows.map((row) => [row.scenario_id, row]));
  const outputByScenario = new Map(outputRows.map((row) => [row.scenario_id, row]));

  return userRows.map((row) => {
    const scenario = getStudyConfig().scenarios.find((s) => s.id === row.scenario_id);
    const ranking = JSON.parse(row.ranking_json) as string[];
    const output = outputByScenario.get(row.scenario_id);
    return {
      scenario: scenario ? visibleScenario(scenario) : { id: row.scenario_id },
      userRanking: scenario ? labeledRanking(scenario, ranking) : ranking,
      otherText: row.other_text,
      userReasoning: row.reasoning,
      userInformationNeeds: row.information_needs,
      userConditionalChange: row.conditional_change,
      agentOutput:
        scenario && output?.ranking_json
          ? {
              agentId: output.agent_id,
              ranking: labeledRanking(scenario, JSON.parse(output.ranking_json) as string[]),
              reasoning: output.reasoning,
            }
          : null,
      feedback: feedbackByScenario.get(row.scenario_id) ?? null,
    };
  });
};

const ensureFinalProfile = async (sessionId: string) => {
  const config = getStudyConfig();
  const responses = surveyResponsesForSession(sessionId);
  const profile = db
    .prepare("SELECT * FROM model_profiles WHERE session_id = ?")
    .get(sessionId) as ProfileRow | undefined;
  if (!profile) throw new Error("Initial profile is not ready");
  if (profile.final_profile) return profile.final_profile;

  const payload = {
    studyVersion: config.version,
    agent: {
      id: config.agent.id,
      label: config.agent.label,
      description: config.agent.description,
    },
    initialProfile: profile.initial_profile,
    availableQuestionnaireResponses: surveyPayloadForAgent(responses),
    scenarioEvidence: allScenarioEvidence(sessionId),
  };
  const result = await generateStudyFinalProfile({
    promptName: config.agent.finalProfilePrompt,
    payload,
  });
  db.prepare(
    `UPDATE model_profiles
     SET final_profile = ?,
         final_model_name = ?,
         final_prompt_name = ?,
         final_system_prompt_text = ?,
         final_system_prompt_hash = ?,
         final_prompt_payload = ?,
         final_raw_output = ?,
         final_started_at = ?,
         final_completed_at = ?,
         updated_at = datetime('now')
     WHERE session_id = ?`,
  ).run(
    result.parsed,
    result.modelName,
    result.promptName,
    result.systemPromptText,
    result.systemPromptHash,
    JSON.stringify(result.payload),
    result.raw,
    result.startedAt,
    result.completedAt,
    sessionId,
  );
  return result.parsed;
};

reflectionRouter.get("/:sessionId", requireAuth, async (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = sessionOwnedBy(sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  try {
    assertScenarioPhaseComplete(sessionId);
    const finalProfile = await ensureFinalProfile(sessionId);
    const profile = db
      .prepare("SELECT * FROM model_profiles WHERE session_id = ?")
      .get(sessionId) as ProfileRow | undefined;
    if (!profile) throw new Error("Final profile generation is incomplete");
    const existing = db
      .prepare("SELECT * FROM final_profile_reflections WHERE session_id = ?")
      .get(sessionId) as
      | { accuracy_score: number; comment: string; created_at: string; updated_at: string }
      | undefined;

    res.json({
      scorePrompt: getStudyConfig().finalProfileReflection.scorePrompt,
      commentPrompt: getStudyConfig().finalProfileReflection.commentPrompt,
      initialProfile: profile.initial_profile,
      finalProfile,
      reflection: existing
        ? {
            accuracyScore: existing.accuracy_score,
            comment: existing.comment,
            createdAt: existing.created_at,
            updatedAt: existing.updated_at,
          }
        : null,
    });
  } catch (err) {
    console.error("Reflection load failed:", err);
    res.status(400).json({ error: (err as Error).message });
  }
});

const submitSchema = z.object({
  accuracyScore: z.number().int().min(1).max(5),
  comment: z.string().min(1),
});

reflectionRouter.post("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = sessionOwnedBy(sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    assertScenarioPhaseComplete(sessionId);
    db.prepare(
      `INSERT INTO final_profile_reflections (session_id, accuracy_score, comment, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(session_id) DO UPDATE SET
         accuracy_score = excluded.accuracy_score,
         comment = excluded.comment,
         updated_at = datetime('now')`,
    ).run(sessionId, parsed.data.accuracyScore, parsed.data.comment.trim());
    db.prepare(
      "UPDATE sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
    ).run(sessionId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
