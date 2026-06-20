import { Router } from "express";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { getStudyConfig, studyQuestionById } from "../study/config.js";
import { labeledRanking, surveyResponsesForSession, visibleScenario } from "../study/responses.js";

export const exportRouter = Router();

type SessionRow = {
  id: string;
  user_id: number;
  status: string;
  current_scenario_index: number;
  participant_code: string | null;
  study_version: string | null;
  created_at: string;
  completed_at: string | null;
};

const parseMaybe = <T>(value: string | null): T | null => (value ? (JSON.parse(value) as T) : null);

type AnalysisRow = {
  participantCode: string | null;
  sessionId: string;
  scenarioId: string;
  scenarioIndex: number;
  scenarioSkipped: boolean;
  skippedAt: string | null;
  modelDisplayLabel: "A" | "B" | null;
  conditionId: string | null;
  modelName: string | null;
  promptName: string | null;
  promptHash: string | null;
  llmStartedAt: string | null;
  llmCompletedAt: string | null;
  llmLatencyMs: number | null;
  userTopOptionId: string | null;
  modelTopOptionId: string | null;
  closerChoice: "A" | "B" | "both" | "neither" | null;
  scoreA: number | null;
  scoreB: number | null;
  modelReasoning: string | null;
  userReasoning: string | null;
  comparisonComment: string | null;
};

const sessionOwnedBy = (sessionId: string, userId: number): SessionRow | undefined =>
  db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as SessionRow | undefined;

exportRouter.get("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = sessionOwnedBy(sessionId, req.userId!);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const config = getStudyConfig();
  const surveyResponses = surveyResponsesForSession(sessionId);
  const survey = Object.entries(surveyResponses).map(([questionId, answer]) => {
    const question = studyQuestionById(questionId);
    return {
      questionId,
      sectionId: config.questionnaires.find((section) =>
        section.questions.some((candidate) => candidate.id === questionId),
      )?.id,
      label: question?.label ?? questionId,
      type: question?.type ?? "unknown",
      answer,
    };
  });

  const profileRows = db
    .prepare("SELECT * FROM model_profiles WHERE session_id = ? ORDER BY condition_id")
    .all(sessionId) as Array<{
    condition_id: string;
    initial_profile: string;
    initial_model_name: string | null;
    initial_prompt_name: string | null;
    initial_system_prompt_text: string | null;
    initial_system_prompt_hash: string | null;
    initial_prompt_payload: string;
    initial_raw_output: string;
    initial_started_at: string | null;
    initial_completed_at: string | null;
    final_profile: string | null;
    final_model_name: string | null;
    final_prompt_name: string | null;
    final_system_prompt_text: string | null;
    final_system_prompt_hash: string | null;
    final_prompt_payload: string | null;
    final_raw_output: string | null;
    final_started_at: string | null;
    final_completed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const userRows = db
    .prepare("SELECT * FROM scenario_user_responses WHERE session_id = ? ORDER BY scenario_index")
    .all(sessionId) as Array<{
    scenario_id: string;
    scenario_index: number;
    ranking_json: string;
    other_text: string | null;
    reasoning: string;
    created_at: string;
    updated_at: string;
  }>;
  const userByScenario = new Map(userRows.map((row) => [row.scenario_id, row]));

  const outputRows = db
    .prepare("SELECT * FROM model_scenario_outputs WHERE session_id = ? ORDER BY scenario_index, display_label")
    .all(sessionId) as Array<{
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
  }>;
  const outputsByScenario = new Map<string, typeof outputRows>();
  for (const row of outputRows) {
    const arr = outputsByScenario.get(row.scenario_id) ?? [];
    arr.push(row);
    outputsByScenario.set(row.scenario_id, arr);
  }

  const feedbackRows = db
    .prepare("SELECT * FROM scenario_model_feedback WHERE session_id = ? ORDER BY scenario_index")
    .all(sessionId) as Array<{
    scenario_id: string;
    scenario_index: number;
    closer_choice: "A" | "B" | "both" | "neither";
    score_a: number;
    score_b: number;
    comment_a: string;
    comment_b: string;
    comparison_comment: string;
    created_at: string;
    updated_at: string;
  }>;
  const feedbackByScenario = new Map(feedbackRows.map((row) => [row.scenario_id, row]));

  const skipRows = db
    .prepare("SELECT * FROM scenario_skips WHERE session_id = ? ORDER BY scenario_index")
    .all(sessionId) as Array<{
    scenario_id: string;
    scenario_index: number;
    skipped_at: string;
  }>;
  const skipByScenario = new Map(skipRows.map((row) => [row.scenario_id, row]));

  const scenarios = config.scenarios.map((scenario, scenarioIndex) => {
    const user = userByScenario.get(scenario.id);
    const userRanking = user ? (JSON.parse(user.ranking_json) as string[]) : null;
    const skip = skipByScenario.get(scenario.id);
    const outputs = (outputsByScenario.get(scenario.id) ?? []).map((output) => ({
      conditionId: output.condition_id,
      displayLabel: output.display_label,
      ranking:
        output.ranking_json != null
          ? labeledRanking(scenario, JSON.parse(output.ranking_json) as string[])
          : null,
      reasoning: output.reasoning,
      modelName: output.model_name,
      promptName: output.prompt_name,
      systemPromptText: output.system_prompt_text,
      systemPromptHash: output.system_prompt_hash,
      promptPayload: JSON.parse(output.prompt_payload_json) as unknown,
      rawOutput: output.raw_output,
      parsedOutput: parseMaybe<unknown>(output.parsed_output_json),
      startedAt: output.started_at,
      completedAt: output.completed_at,
      latencyMs: output.latency_ms,
      error: output.error,
      createdAt: output.created_at,
    }));
    const feedback = feedbackByScenario.get(scenario.id);
    return {
      scenario: visibleScenario(scenario),
      scenarioIndex,
      userResponse: user
        ? {
            ranking: userRanking ? labeledRanking(scenario, userRanking) : null,
            otherText: user.other_text,
            reasoning: user.reasoning,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          }
        : null,
      modelOutputs: outputs,
      feedback: feedback
        ? {
            closerChoice: feedback.closer_choice,
            scoreA: feedback.score_a,
            scoreB: feedback.score_b,
            commentA: feedback.comment_a,
            commentB: feedback.comment_b,
            comparisonComment: feedback.comparison_comment,
            createdAt: feedback.created_at,
            updatedAt: feedback.updated_at,
          }
        : null,
      skip: skip
        ? {
            skippedAt: skip.skipped_at,
          }
        : null,
    };
  });

  const assignments = db
    .prepare("SELECT * FROM profile_followup_assignments WHERE session_id = ? ORDER BY display_label")
    .all(sessionId) as Array<{
    condition_id: string;
    display_label: "A" | "B";
    created_at: string;
  }>;
  const followup = db
    .prepare("SELECT * FROM profile_followup_feedback WHERE session_id = ?")
    .get(sessionId) as { responses_json: string; created_at: string; updated_at: string } | undefined;

  const analysisRows: AnalysisRow[] = scenarios.flatMap((scenario): AnalysisRow[] => {
    if (scenario.skip && scenario.modelOutputs.length === 0) {
      return [
        {
          participantCode: session.participant_code,
          sessionId: session.id,
          scenarioId: scenario.scenario.id,
          scenarioIndex: scenario.scenarioIndex,
          scenarioSkipped: true,
          skippedAt: scenario.skip.skippedAt,
          modelDisplayLabel: null,
          conditionId: null,
          modelName: null,
          promptName: null,
          promptHash: null,
          llmStartedAt: null,
          llmCompletedAt: null,
          llmLatencyMs: null,
          userTopOptionId: null,
          modelTopOptionId: null,
          closerChoice: null,
          scoreA: null,
          scoreB: null,
          modelReasoning: null,
          userReasoning: null,
          comparisonComment: null,
        },
      ];
    }

    return scenario.modelOutputs.map((output) => ({
      participantCode: session.participant_code,
      sessionId: session.id,
      scenarioId: scenario.scenario.id,
      scenarioIndex: scenario.scenarioIndex,
      scenarioSkipped: Boolean(scenario.skip),
      skippedAt: scenario.skip?.skippedAt ?? null,
      modelDisplayLabel: output.displayLabel,
      conditionId: output.conditionId,
      modelName: output.modelName,
      promptName: output.promptName,
      promptHash: output.systemPromptHash,
      llmStartedAt: output.startedAt,
      llmCompletedAt: output.completedAt,
      llmLatencyMs: output.latencyMs,
      userTopOptionId: scenario.userResponse?.ranking?.[0]?.optionId ?? null,
      modelTopOptionId: output.ranking?.[0]?.optionId ?? null,
      closerChoice: scenario.feedback?.closerChoice ?? null,
      scoreA: scenario.feedback?.scoreA ?? null,
      scoreB: scenario.feedback?.scoreB ?? null,
      modelReasoning: output.reasoning,
      userReasoning: scenario.userResponse?.reasoning ?? null,
      comparisonComment: scenario.feedback?.comparisonComment ?? null,
    }));
  });

  const payload = {
    schemaVersion: 4,
    studyVersion: session.study_version ?? config.version,
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      participantCode: session.participant_code,
      status: session.status,
      currentScenarioIndex: session.current_scenario_index,
      createdAt: session.created_at,
      completedAt: session.completed_at,
    },
    studyConfig: {
      version: config.version,
      title: config.title,
      modelConditions: config.modelConditions.map((condition) => ({
        id: condition.id,
        label: condition.label,
        description: condition.description,
        includedQuestionIds: condition.includedQuestionIds,
      })),
    },
    survey,
    profiles: profileRows.map((row) => ({
      conditionId: row.condition_id,
      initialProfile: row.initial_profile,
      initialModelName: row.initial_model_name,
      initialPromptName: row.initial_prompt_name,
      initialSystemPromptText: row.initial_system_prompt_text,
      initialSystemPromptHash: row.initial_system_prompt_hash,
      initialPromptPayload: JSON.parse(row.initial_prompt_payload) as unknown,
      initialRawOutput: row.initial_raw_output,
      initialStartedAt: row.initial_started_at,
      initialCompletedAt: row.initial_completed_at,
      finalProfile: row.final_profile,
      finalModelName: row.final_model_name,
      finalPromptName: row.final_prompt_name,
      finalSystemPromptText: row.final_system_prompt_text,
      finalSystemPromptHash: row.final_system_prompt_hash,
      finalPromptPayload: parseMaybe<unknown>(row.final_prompt_payload),
      finalRawOutput: row.final_raw_output,
      finalStartedAt: row.final_started_at,
      finalCompletedAt: row.final_completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    scenarios,
    profileFollowup: {
      assignments: assignments.map((row) => ({
        conditionId: row.condition_id,
        displayLabel: row.display_label,
        createdAt: row.created_at,
      })),
      feedback: followup
        ? {
            responses: JSON.parse(followup.responses_json) as unknown,
            createdAt: followup.created_at,
            updatedAt: followup.updated_at,
          }
        : null,
    },
    analysisRows,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="scheduling-study-${sessionId}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});
