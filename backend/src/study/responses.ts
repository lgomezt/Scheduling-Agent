import { db } from "../db/client.js";
import {
  allStudyQuestions,
  conditionQuestionIds,
  getStudyConfig,
  type ModelCondition,
  type StudyQuestion,
  type StudyScenario,
} from "./config.js";

export type SurveyAnswerMap = Record<string, unknown>;

export const parseJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  return JSON.parse(value) as T;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const choiceIds = (question: StudyQuestion): Set<string> =>
  new Set((question.choices ?? []).map((choice) => choice.id));

export const validateSurveyResponses = (responses: SurveyAnswerMap): SurveyAnswerMap => {
  const normalized: SurveyAnswerMap = {};

  for (const question of allStudyQuestions()) {
    const value = responses[question.id];
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;

    if (question.type === "text" || question.type === "textarea") {
      if (!isNonEmptyString(value)) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      normalized[question.id] = trimmed;
      continue;
    }

    if (question.type === "single_choice") {
      if (!isNonEmptyString(value)) throw new Error(`Response for ${question.id} must be a choice id`);
      if (!choiceIds(question).has(value)) throw new Error(`Invalid choice "${value}" for ${question.id}`);
      normalized[question.id] = value;
      continue;
    }

    if (question.type === "multi_choice") {
      if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
        throw new Error(`Response for ${question.id} must be a choice id array`);
      }
      if (question.maxSelections && value.length > question.maxSelections) {
        throw new Error(`Response for ${question.id} allows at most ${question.maxSelections} selections`);
      }
      const valid = choiceIds(question);
      for (const choiceId of value) {
        if (!valid.has(choiceId)) throw new Error(`Invalid choice "${choiceId}" for ${question.id}`);
      }
      normalized[question.id] = [...new Set(value)];
      continue;
    }

    if (question.type === "scale") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`Response for ${question.id} must be an integer`);
      }
      if (typeof question.min !== "number" || typeof question.max !== "number") {
        throw new Error(`Scale question ${question.id} is missing bounds`);
      }
      if (value < question.min || value > question.max) {
        throw new Error(`Response for ${question.id} must be between ${question.min} and ${question.max}`);
      }
      normalized[question.id] = value;
    }
  }

  return normalized;
};

export const validateScenarioRanking = (scenario: StudyScenario, ranking: unknown, otherText: unknown) => {
  if (!Array.isArray(ranking) || !ranking.every(isNonEmptyString)) {
    throw new Error("Ranking must be an array of option ids");
  }
  const optionIds = scenario.options.map((option) => option.id);
  if (ranking.length !== optionIds.length) {
    throw new Error("Ranking must include every option exactly once");
  }
  if (new Set(ranking).size !== ranking.length) {
    throw new Error("Ranking cannot include duplicate option ids");
  }
  for (const optionId of optionIds) {
    if (!ranking.includes(optionId)) throw new Error(`Ranking is missing option ${optionId}`);
  }
  return {
    ranking,
    otherText: isNonEmptyString(otherText) ? otherText.trim() : null,
  };
};

export const surveyResponsesForSession = (sessionId: string): SurveyAnswerMap => {
  const rows = db
    .prepare("SELECT question_id, answer_json FROM survey_responses WHERE session_id = ?")
    .all(sessionId) as Array<{ question_id: string; answer_json: string }>;
  return Object.fromEntries(rows.map((row) => [row.question_id, JSON.parse(row.answer_json) as unknown]));
};

const answerLabel = (question: StudyQuestion, answer: unknown) => {
  const choices = new Map((question.choices ?? []).map((choice) => [choice.id, choice.label]));
  if (question.type === "single_choice" && typeof answer === "string") {
    return choices.get(answer) ?? answer;
  }
  if (question.type === "multi_choice" && Array.isArray(answer)) {
    return answer.map((choiceId) => choices.get(String(choiceId)) ?? String(choiceId));
  }
  if (question.type === "scale" && typeof answer === "number") {
    return {
      value: answer,
      min: question.min,
      max: question.max,
      minLabel: question.minLabel,
      maxLabel: question.maxLabel,
    };
  }
  return answer;
};

export const surveyPayloadForCondition = (condition: ModelCondition, responses: SurveyAnswerMap) => {
  const ids = new Set(conditionQuestionIds(condition));
  return allStudyQuestions()
    .filter((question) => ids.has(question.id))
    .map((question) => ({
      questionId: question.id,
      type: question.type,
      label: question.label,
      answer: responses[question.id] ?? null,
      answerLabel: answerLabel(question, responses[question.id]),
    }));
};

export const scenarioOptionMap = (scenario: StudyScenario): Record<string, string> =>
  Object.fromEntries(scenario.options.map((option) => [option.id, option.label]));

export const labeledRanking = (scenario: StudyScenario, ranking: string[]) => {
  const labels = scenarioOptionMap(scenario);
  return ranking.map((optionId, index) => ({
    rank: index + 1,
    optionId,
    label: labels[optionId] ?? optionId,
  }));
};

export const validateModelRanking = (scenario: StudyScenario, ranking: Array<{ optionId: string; rank: number }>) => {
  const optionIds = scenario.options.map((option) => option.id);
  const sorted = [...ranking].sort((a, b) => a.rank - b.rank);
  const ids = sorted.map((item) => item.optionId);
  if (ids.length !== optionIds.length || new Set(ids).size !== ids.length) {
    throw new Error("Model ranking must include each option exactly once");
  }
  for (const optionId of optionIds) {
    if (!ids.includes(optionId)) throw new Error(`Model ranking is missing option ${optionId}`);
  }
  const expectedRanks = optionIds.map((_, i) => i + 1);
  if (!expectedRanks.every((rank, index) => sorted[index]?.rank === rank)) {
    throw new Error("Model ranking ranks must be consecutive starting at 1");
  }
  return ids;
};

export const visibleScenario = (scenario: StudyScenario) => ({
  ...scenario,
  description: scenario.prompt,
  promptSummary: null,
  contextEvents: [],
  options: scenario.options.map((option) => ({
    ...option,
    suggestedStart: "",
    suggestedEnd: "",
  })),
});

export const allVisibleScenarios = () => getStudyConfig().scenarios.map(visibleScenario);
