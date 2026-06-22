import { api } from "./client";

export type QuestionType = "text" | "textarea" | "single_choice" | "multi_choice" | "scale";

export type StudyChoice = {
  id: string;
  label: string;
  isOther?: boolean;
};

export type StudyQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  helpText?: string;
  required: boolean;
  choices?: StudyChoice[];
  maxSelections?: number;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
};

export type StudyQuestionnaire = {
  id: string;
  title: string;
  description?: string;
  questions: StudyQuestion[];
};

export type ScenarioOption = StudyChoice & {
  suggestedStart?: string;
  suggestedEnd?: string;
};

export type RankedOption = {
  rank: number;
  optionId: string;
  label: string;
};

export type AgentOutput = {
  agentId: string;
  ranking: RankedOption[];
  reasoning: string;
  error?: string | null;
};

export type ScenarioFeedback = {
  reasoningAlignmentScore: number;
  comment: string;
};

export type StudyScenario = {
  id: string;
  title: string;
  prompt: string;
  description: string;
  reasoningPrompt: string;
  informationNeedsPrompt: string;
  conditionalChangePrompt: string;
  options: ScenarioOption[];
  promptSummary: string | null;
  contextEvents: Array<{ title: string; start: string; end: string }>;
  userResponse?: {
    ranking: RankedOption[];
    otherText: string | null;
    reasoning: string;
    informationNeeds: string;
    conditionalChange: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  agentOutput?: AgentOutput | null;
  feedback?: (ScenarioFeedback & { createdAt: string; updatedAt: string }) | null;
  skip?: { skippedAt: string } | null;
};

export type StudyConfig = {
  version: string;
  title: string;
  questionnaires: StudyQuestionnaire[];
  scenarios: StudyScenario[];
  agent: {
    id: string;
    label: string;
    description?: string;
  };
  finalProfileReflection: {
    enabled: boolean;
    scorePrompt: string;
    commentPrompt: string;
  };
};

export type SurveyState = {
  participantCode: string | null;
  responses: Record<string, unknown>;
  profileReady: boolean;
};

export type ScenarioState = {
  scenarios: StudyScenario[];
  currentScenarioIndex: number;
  completedScenarioIds: string[];
  total: number;
};

export type ReflectionState = {
  scorePrompt: string;
  commentPrompt: string;
  initialProfile: string;
  finalProfile: string;
  reflection: {
    accuracyScore: number;
    comment: string;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type SurveyResponses = Record<string, string | number | string[]>;

export const getStudyConfig = () => api<StudyConfig>("/api/study/config");

export const getSurveyState = (sessionId: string) =>
  api<SurveyState>(`/api/survey/${sessionId}`);

export const submitSurvey = (sessionId: string, responses: SurveyResponses) =>
  api<{ ok: true; participantCode: string; profileCount: number }>(`/api/survey/${sessionId}`, {
    method: "POST",
    body: JSON.stringify({ responses }),
  });

export const getScenarioState = (sessionId: string) =>
  api<ScenarioState>(`/api/scenarios/${sessionId}`);

export const submitScenario = (
  sessionId: string,
  scenarioId: string,
  input: {
    ranking: string[];
    reasoning: string;
    informationNeeds: string;
    conditionalChange: string;
    otherText?: string;
  },
) =>
  api<{ ok: true; scenarioId: string; agentOutput: AgentOutput }>(
    `/api/scenarios/${scenarioId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ sessionId, ...input }),
    },
  );

export const submitScenarioFeedback = (
  sessionId: string,
  scenarioId: string,
  input: ScenarioFeedback,
) =>
  api<{ ok: true; nextScenarioIndex: number; scenariosComplete: boolean }>(
    `/api/scenarios/${scenarioId}/feedback`,
    {
      method: "POST",
      body: JSON.stringify({ sessionId, ...input }),
    },
  );

export const skipScenario = (sessionId: string, scenarioId: string) =>
  api<{ ok: true; skippedAt: string; nextScenarioIndex: number; scenariosComplete: boolean }>(
    `/api/scenarios/${scenarioId}/skip`,
    {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    },
  );

export const getReflection = (sessionId: string) =>
  api<ReflectionState>(`/api/reflection/${sessionId}`);

export const submitReflection = (
  sessionId: string,
  input: { accuracyScore: number; comment: string },
) =>
  api<{ ok: true }>(`/api/reflection/${sessionId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
