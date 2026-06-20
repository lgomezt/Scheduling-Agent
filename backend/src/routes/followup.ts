import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { getStudyConfig } from "../study/config.js";
import {
  labeledRanking,
  surveyPayloadForCondition,
  surveyResponsesForSession,
  visibleScenario,
} from "../study/responses.js";
import { generateStudyFinalProfile } from "../services/gemini.js";

export const followupRouter = Router();

type SessionRow = {
  id: string;
  user_id: number;
  status: string;
  current_scenario_index: number;
};

type ProfileRow = {
  condition_id: string;
  initial_profile: string;
  initial_prompt_payload: string;
  initial_raw_output: string;
  final_profile: string | null;
  final_prompt_payload: string | null;
  final_raw_output: string | null;
};

type AssignmentRow = {
  condition_id: string;
  display_label: "A" | "B";
};

const sessionOwnedBy = (sessionId: string, userId: number): SessionRow | undefined =>
  db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as SessionRow | undefined;

const assertScenarioFeedbackComplete = (sessionId: string) => {
  const count = (
    db.prepare("SELECT COUNT(*) AS n FROM scenario_model_feedback WHERE session_id = ?").get(sessionId) as {
      n: number;
    }
  ).n;
  if (count !== getStudyConfig().scenarios.length) {
    throw new Error("All scenario feedback must be completed before the follow-up");
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
  }>;
  const feedbackRows = db
    .prepare("SELECT * FROM scenario_model_feedback WHERE session_id = ?")
    .all(sessionId) as Array<{
    scenario_id: string;
    closer_choice: string;
    score_a: number;
    score_b: number;
    comment_a: string;
    comment_b: string;
    comparison_comment: string;
  }>;
  const outputRows = db
    .prepare("SELECT * FROM model_scenario_outputs WHERE session_id = ? ORDER BY scenario_index, display_label")
    .all(sessionId) as Array<{
    scenario_id: string;
    condition_id: string;
    display_label: "A" | "B";
    ranking_json: string | null;
    reasoning: string | null;
  }>;
  const feedbackByScenario = new Map(feedbackRows.map((row) => [row.scenario_id, row]));
  const outputsByScenario = new Map<string, typeof outputRows>();
  for (const row of outputRows) {
    const arr = outputsByScenario.get(row.scenario_id) ?? [];
    arr.push(row);
    outputsByScenario.set(row.scenario_id, arr);
  }

  return userRows.map((row) => {
    const scenario = getStudyConfig().scenarios.find((s) => s.id === row.scenario_id);
    const ranking = JSON.parse(row.ranking_json) as string[];
    return {
      scenario: scenario ? visibleScenario(scenario) : { id: row.scenario_id },
      userRanking: scenario ? labeledRanking(scenario, ranking) : ranking,
      otherText: row.other_text,
      userReasoning: row.reasoning,
      modelOutputs: (outputsByScenario.get(row.scenario_id) ?? []).map((output) => ({
        conditionId: output.condition_id,
        displayLabel: output.display_label,
        ranking:
          scenario && output.ranking_json
            ? labeledRanking(scenario, JSON.parse(output.ranking_json) as string[])
            : null,
        reasoning: output.reasoning,
      })),
      feedback: feedbackByScenario.get(row.scenario_id) ?? null,
    };
  });
};

const ensureFinalProfiles = async (sessionId: string) => {
  const config = getStudyConfig();
  const responses = surveyResponsesForSession(sessionId);
  const profileRows = db
    .prepare("SELECT * FROM model_profiles WHERE session_id = ?")
    .all(sessionId) as ProfileRow[];
  const byCondition = new Map(profileRows.map((row) => [row.condition_id, row]));
  if (profileRows.length !== config.modelConditions.length) {
    throw new Error("Initial profiles are not ready");
  }

  const evidence = allScenarioEvidence(sessionId);
  await Promise.all(
    config.modelConditions.map(async (condition) => {
      const current = byCondition.get(condition.id);
      if (!current) throw new Error(`Missing profile for ${condition.id}`);
      if (current.final_profile) return;

      const payload = {
        studyVersion: config.version,
        condition: {
          id: condition.id,
          label: condition.label,
          description: condition.description,
          includedQuestionIds: condition.includedQuestionIds,
        },
        initialProfile: current.initial_profile,
        availableQuestionnaireResponses: surveyPayloadForCondition(condition, responses),
        scenarioEvidence: evidence,
      };
      const result = await generateStudyFinalProfile({
        promptName: condition.finalProfilePrompt,
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
         WHERE session_id = ? AND condition_id = ?`,
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
        condition.id,
      );
    }),
  );
};

const ensureAssignments = (sessionId: string) => {
  const existing = db
    .prepare("SELECT condition_id, display_label FROM profile_followup_assignments WHERE session_id = ?")
    .all(sessionId) as AssignmentRow[];
  if (existing.length === getStudyConfig().modelConditions.length) return existing;

  db.prepare("DELETE FROM profile_followup_assignments WHERE session_id = ?").run(sessionId);
  const labels = Math.random() < 0.5 ? (["A", "B"] as const) : (["B", "A"] as const);
  const insert = db.prepare(
    "INSERT INTO profile_followup_assignments (session_id, condition_id, display_label) VALUES (?, ?, ?)",
  );
  getStudyConfig().modelConditions.forEach((condition, index) => {
    insert.run(sessionId, condition.id, labels[index]);
  });
  return db
    .prepare("SELECT condition_id, display_label FROM profile_followup_assignments WHERE session_id = ?")
    .all(sessionId) as AssignmentRow[];
};

followupRouter.get("/:sessionId", requireAuth, async (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = sessionOwnedBy(sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  try {
    assertScenarioFeedbackComplete(sessionId);
    await ensureFinalProfiles(sessionId);
    const assignments = ensureAssignments(sessionId);
    const profiles = db
      .prepare("SELECT * FROM model_profiles WHERE session_id = ?")
      .all(sessionId) as ProfileRow[];
    const profileByCondition = new Map(profiles.map((row) => [row.condition_id, row]));
    const sets = assignments
      .map((assignment) => {
        const profile = profileByCondition.get(assignment.condition_id);
        if (!profile || !profile.final_profile) throw new Error("Final profile generation is incomplete");
        return {
          label: assignment.display_label,
          initialProfile: profile.initial_profile,
          finalProfile: profile.final_profile,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    res.json({
      questions: getStudyConfig().finalProfileFollowup.questions,
      choices: getStudyConfig().finalProfileFollowup.choices,
      sets,
    });
  } catch (err) {
    console.error("Follow-up load failed:", err);
    res.status(400).json({ error: (err as Error).message });
  }
});

const followupAnswerSchema = z.object({
  choice: z.enum(["A", "B", "both", "neither"]),
  reason: z.string().min(1),
});

const submitSchema = z.object({
  responses: z.record(z.string(), followupAnswerSchema),
});

followupRouter.post("/:sessionId", requireAuth, (req, res) => {
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
    assertScenarioFeedbackComplete(sessionId);
    const questionIds = getStudyConfig().finalProfileFollowup.questions.map((question) => question.id);
    for (const questionId of questionIds) {
      const answer = parsed.data.responses[questionId];
      if (!answer || !answer.reason.trim()) {
        throw new Error(`Missing follow-up response for ${questionId}`);
      }
    }
    db.prepare(
      `INSERT INTO profile_followup_feedback (session_id, responses_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(session_id) DO UPDATE SET
         responses_json = excluded.responses_json,
         updated_at = datetime('now')`,
    ).run(sessionId, JSON.stringify(parsed.data.responses));
    db.prepare(
      "UPDATE sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
    ).run(sessionId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
