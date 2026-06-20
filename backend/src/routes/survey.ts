import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { getStudyConfig } from "../study/config.js";
import {
  surveyPayloadForCondition,
  surveyResponsesForSession,
  validateSurveyResponses,
} from "../study/responses.js";
import { generateStudyInitialProfile } from "../services/gemini.js";

export const surveyRouter = Router();

type SessionRow = { id: string; user_id: number; participant_code: string | null };

const sessionOwnedBy = (sessionId: string, userId: number): SessionRow | undefined =>
  db
    .prepare("SELECT id, user_id, participant_code FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as SessionRow | undefined;

surveyRouter.get("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = sessionOwnedBy(sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const profileCount = (
    db.prepare("SELECT COUNT(*) AS n FROM model_profiles WHERE session_id = ?").get(sessionId) as { n: number }
  ).n;
  res.json({
    participantCode: session.participant_code,
    responses: surveyResponsesForSession(sessionId),
    profileReady: profileCount === getStudyConfig().modelConditions.length,
  });
});

const submitSchema = z.object({
  responses: z.record(z.string(), z.unknown()),
});

surveyRouter.post("/:sessionId", requireAuth, async (req, res) => {
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

  let responses: ReturnType<typeof validateSurveyResponses>;
  try {
    responses = validateSurveyResponses(parsed.data.responses);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const config = getStudyConfig();
  const participantCode =
    String(responses.participant_code ?? "").trim() || `test-${sessionId.slice(0, 8)}`;

  try {
    const profileResults = await Promise.all(
      config.modelConditions.map(async (condition) => {
        const payload = {
          studyVersion: config.version,
          condition: {
            id: condition.id,
            label: condition.label,
            description: condition.description,
            includedQuestionIds: condition.includedQuestionIds,
          },
          questionnaireResponses: surveyPayloadForCondition(condition, responses),
        };
        const result = await generateStudyInitialProfile({
          promptName: condition.initialProfilePrompt,
          payload,
        });
        return { condition, result };
      }),
    );

    const tx = db.transaction(() => {
      db.prepare("DELETE FROM profile_followup_feedback WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM profile_followup_assignments WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM scenario_model_feedback WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM model_scenario_outputs WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM scenario_skips WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM scenario_user_responses WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM model_profiles WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM survey_responses WHERE session_id = ?").run(sessionId);

      const insertResponse = db.prepare(
        `INSERT INTO survey_responses (session_id, question_id, answer_json, updated_at)
         VALUES (?, ?, ?, datetime('now'))`,
      );
      for (const [questionId, answer] of Object.entries(responses)) {
        insertResponse.run(sessionId, questionId, JSON.stringify(answer));
      }

      const insertProfile = db.prepare(
        `INSERT INTO model_profiles
         (session_id, condition_id, initial_profile, initial_model_name, initial_prompt_name,
          initial_system_prompt_text, initial_system_prompt_hash, initial_prompt_payload,
          initial_raw_output, initial_started_at, initial_completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      );
      for (const { condition, result } of profileResults) {
        insertProfile.run(
          sessionId,
          condition.id,
          result.parsed,
          result.modelName,
          result.promptName,
          result.systemPromptText,
          result.systemPromptHash,
          JSON.stringify(result.payload),
          result.raw,
          result.startedAt,
          result.completedAt,
        );
      }

      db.prepare(
        `UPDATE sessions
         SET participant_code = ?, study_version = ?, current_scenario_index = 0,
             status = 'in_progress', completed_at = NULL
         WHERE id = ?`,
      ).run(participantCode, config.version, sessionId);
    });
    tx();

    res.json({
      ok: true,
      participantCode,
      profileCount: profileResults.length,
    });
  } catch (err) {
    console.error("Survey submission failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});
