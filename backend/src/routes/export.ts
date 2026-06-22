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

type ProfileSectionDiff = {
  heading: string;
  deleted: string[];
  added: string[];
};

type AnalysisRow = {
  participantCode: string | null;
  sessionId: string;
  scenarioId: string;
  scenarioIndex: number;
  scenarioSkipped: boolean;
  skippedAt: string | null;
  agentId: string | null;
  modelName: string | null;
  promptName: string | null;
  promptHash: string | null;
  llmStartedAt: string | null;
  llmCompletedAt: string | null;
  llmLatencyMs: number | null;
  userTopOptionId: string | null;
  agentTopOptionId: string | null;
  reasoningAlignmentScore: number | null;
  userReasoning: string | null;
  userInformationNeeds: string | null;
  userConditionalChange: string | null;
  agentReasoning: string | null;
  feedbackComment: string | null;
};

const sessionOwnedBy = (sessionId: string, userId: number): SessionRow | undefined =>
  db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as SessionRow | undefined;

const parseProfileSections = (markdown: string) => {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string }> = [];
  let current: { heading: string; body: string } | null = null;

  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      if (current) sections.push({ ...current, body: current.body.trimEnd() });
      current = { heading: line.replace(/^#\s+/, "").trim(), body: "" };
      continue;
    }
    if (!current) current = { heading: "Profile", body: "" };
    current.body += `${line}\n`;
  }
  if (current) sections.push({ ...current, body: current.body.trimEnd() });
  return sections;
};

const lineDiff = (before: string, after: string): { deleted: string[]; added: string[] } => {
  const oldLines = before ? before.split(/\r?\n/) : [];
  const newLines = after ? after.split(/\r?\n/) : [];
  const dp = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const deleted: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      deleted.push(oldLines[i]);
      i += 1;
    } else {
      added.push(newLines[j]);
      j += 1;
    }
  }
  while (i < oldLines.length) {
    deleted.push(oldLines[i]);
    i += 1;
  }
  while (j < newLines.length) {
    added.push(newLines[j]);
    j += 1;
  }

  return { deleted, added };
};

const buildProfileDiff = (initialProfile: string, finalProfile: string): ProfileSectionDiff[] => {
  const initialSections = parseProfileSections(initialProfile);
  const finalSections = parseProfileSections(finalProfile);
  const initialByHeading = new Map(initialSections.map((section) => [section.heading, section]));
  const finalByHeading = new Map(finalSections.map((section) => [section.heading, section]));
  const headings = [
    ...initialSections.map((section) => section.heading),
    ...finalSections.map((section) => section.heading).filter((heading) => !initialByHeading.has(heading)),
  ];

  return headings.map((heading) => {
    const diff = lineDiff(initialByHeading.get(heading)?.body ?? "", finalByHeading.get(heading)?.body ?? "");
    return { heading, ...diff };
  });
};

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

  const profile = db
    .prepare("SELECT * FROM model_profiles WHERE session_id = ?")
    .get(sessionId) as
    | {
        agent_id: string;
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
      }
    | undefined;

  const userRows = db
    .prepare("SELECT * FROM scenario_user_responses WHERE session_id = ? ORDER BY scenario_index")
    .all(sessionId) as Array<{
    scenario_id: string;
    scenario_index: number;
    ranking_json: string;
    other_text: string | null;
    reasoning: string;
    information_needs: string;
    conditional_change: string;
    created_at: string;
    updated_at: string;
  }>;
  const userByScenario = new Map(userRows.map((row) => [row.scenario_id, row]));

  const outputRows = db
    .prepare("SELECT * FROM model_scenario_outputs WHERE session_id = ? ORDER BY scenario_index")
    .all(sessionId) as Array<{
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
  }>;
  const outputByScenario = new Map(outputRows.map((row) => [row.scenario_id, row]));

  const feedbackRows = db
    .prepare("SELECT * FROM scenario_agent_feedback WHERE session_id = ? ORDER BY scenario_index")
    .all(sessionId) as Array<{
    scenario_id: string;
    scenario_index: number;
    reasoning_alignment_score: number;
    comment: string;
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
    const output = outputByScenario.get(scenario.id);
    const feedback = feedbackByScenario.get(scenario.id);
    const skip = skipByScenario.get(scenario.id);

    return {
      scenario: visibleScenario(scenario),
      scenarioIndex,
      userResponse: user
        ? {
            ranking: userRanking ? labeledRanking(scenario, userRanking) : null,
            otherText: user.other_text,
            reasoning: user.reasoning,
            informationNeeds: user.information_needs,
            conditionalChange: user.conditional_change,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          }
        : null,
      agentOutput: output
        ? {
            agentId: output.agent_id,
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
          }
        : null,
      feedback: feedback
        ? {
            reasoningAlignmentScore: feedback.reasoning_alignment_score,
            comment: feedback.comment,
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

  const finalReflection = db
    .prepare("SELECT * FROM final_profile_reflections WHERE session_id = ?")
    .get(sessionId) as
    | { accuracy_score: number; comment: string; created_at: string; updated_at: string }
    | undefined;

  const analysisRows: AnalysisRow[] = scenarios.map((scenario): AnalysisRow => {
    const output = scenario.agentOutput;
    return {
      participantCode: session.participant_code,
      sessionId: session.id,
      scenarioId: scenario.scenario.id,
      scenarioIndex: scenario.scenarioIndex,
      scenarioSkipped: Boolean(scenario.skip),
      skippedAt: scenario.skip?.skippedAt ?? null,
      agentId: output?.agentId ?? null,
      modelName: output?.modelName ?? null,
      promptName: output?.promptName ?? null,
      promptHash: output?.systemPromptHash ?? null,
      llmStartedAt: output?.startedAt ?? null,
      llmCompletedAt: output?.completedAt ?? null,
      llmLatencyMs: output?.latencyMs ?? null,
      userTopOptionId: scenario.userResponse?.ranking?.[0]?.optionId ?? null,
      agentTopOptionId: output?.ranking?.[0]?.optionId ?? null,
      reasoningAlignmentScore: scenario.feedback?.reasoningAlignmentScore ?? null,
      userReasoning: scenario.userResponse?.reasoning ?? null,
      userInformationNeeds: scenario.userResponse?.informationNeeds ?? null,
      userConditionalChange: scenario.userResponse?.conditionalChange ?? null,
      agentReasoning: output?.reasoning ?? null,
      feedbackComment: scenario.feedback?.comment ?? null,
    };
  });

  const payload = {
    schemaVersion: 5,
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
      agent: {
        id: config.agent.id,
        label: config.agent.label,
        description: config.agent.description,
      },
      finalProfileReflection: config.finalProfileReflection,
    },
    survey,
    profile: profile
      ? {
          agentId: profile.agent_id,
          initialProfile: profile.initial_profile,
          initialModelName: profile.initial_model_name,
          initialPromptName: profile.initial_prompt_name,
          initialSystemPromptText: profile.initial_system_prompt_text,
          initialSystemPromptHash: profile.initial_system_prompt_hash,
          initialPromptPayload: JSON.parse(profile.initial_prompt_payload) as unknown,
          initialRawOutput: profile.initial_raw_output,
          initialStartedAt: profile.initial_started_at,
          initialCompletedAt: profile.initial_completed_at,
          finalProfile: profile.final_profile,
          finalModelName: profile.final_model_name,
          finalPromptName: profile.final_prompt_name,
          finalSystemPromptText: profile.final_system_prompt_text,
          finalSystemPromptHash: profile.final_system_prompt_hash,
          finalPromptPayload: parseMaybe<unknown>(profile.final_prompt_payload),
          finalRawOutput: profile.final_raw_output,
          finalStartedAt: profile.final_started_at,
          finalCompletedAt: profile.final_completed_at,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        }
      : null,
    scenarios,
    profileChangeDiff:
      profile?.final_profile != null ? buildProfileDiff(profile.initial_profile, profile.final_profile) : null,
    finalProfileReflection: finalReflection
      ? {
          scorePrompt: config.finalProfileReflection.scorePrompt,
          commentPrompt: config.finalProfileReflection.commentPrompt,
          accuracyScore: finalReflection.accuracy_score,
          comment: finalReflection.comment,
          createdAt: finalReflection.created_at,
          updatedAt: finalReflection.updated_at,
        }
      : null,
    analysisRows,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="scheduling-study-${sessionId}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});
