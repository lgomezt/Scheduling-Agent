import { db } from "../db/client.js";
import {
  allStudyQuestions,
  getStudyConfig,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const choiceIds = (question: StudyQuestion): Set<string> =>
  new Set((question.choices ?? []).map((choice) => choice.id));

const otherChoiceFor = (question: StudyQuestion) => question.choices?.find((choice) => choice.isOther);

const isOtherChoice = (question: StudyQuestion, choiceId: string) =>
  Boolean(question.choices?.some((choice) => choice.id === choiceId && choice.isOther));

const otherTextFor = (value: unknown) =>
  isRecord(value) && isNonEmptyString(value.otherText) ? value.otherText.trim() : null;

const singleChoiceIdFor = (value: unknown) => {
  if (isNonEmptyString(value)) return value;
  if (isRecord(value) && isNonEmptyString(value.choiceId)) return value.choiceId;
  return null;
};

const multiChoiceIdsFor = (value: unknown) => {
  if (Array.isArray(value) && value.every(isNonEmptyString)) return value;
  if (isRecord(value) && Array.isArray(value.choices) && value.choices.every(isNonEmptyString)) {
    return value.choices;
  }
  return null;
};

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
      const choiceId = singleChoiceIdFor(value);
      if (!choiceId) throw new Error(`Response for ${question.id} must be a choice id`);
      if (!choiceIds(question).has(choiceId)) throw new Error(`Invalid choice "${choiceId}" for ${question.id}`);
      if (isOtherChoice(question, choiceId)) {
        const otherText = otherTextFor(value);
        if (!otherText) throw new Error(`Other details are required for ${question.id}`);
        normalized[question.id] = { choiceId, otherText };
      } else {
        normalized[question.id] = choiceId;
      }
      continue;
    }

    if (question.type === "multi_choice") {
      const choices = multiChoiceIdsFor(value);
      if (!choices) {
        throw new Error(`Response for ${question.id} must be a choice id array`);
      }
      if (question.maxSelections && choices.length > question.maxSelections) {
        throw new Error(`Response for ${question.id} allows at most ${question.maxSelections} selections`);
      }
      const valid = choiceIds(question);
      for (const choiceId of choices) {
        if (!valid.has(choiceId)) throw new Error(`Invalid choice "${choiceId}" for ${question.id}`);
      }
      const deduped = [...new Set(choices)];
      const otherChoice = otherChoiceFor(question);
      if (otherChoice && deduped.includes(otherChoice.id)) {
        const otherText = otherTextFor(value);
        if (!otherText) throw new Error(`Other details are required for ${question.id}`);
        normalized[question.id] = { choices: deduped, otherText };
      } else {
        normalized[question.id] = deduped;
      }
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
  const otherOption = scenario.options.find((option) => option.isOther);
  if (otherOption && ranking[ranking.length - 1] !== otherOption.id && !isNonEmptyString(otherText)) {
    throw new Error("Other details are required when Other is not ranked last");
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
  if (question.type === "single_choice" && isRecord(answer) && isNonEmptyString(answer.choiceId)) {
    const label = choices.get(answer.choiceId) ?? answer.choiceId;
    return isOtherChoice(question, answer.choiceId) && isNonEmptyString(answer.otherText)
      ? `${label}: ${answer.otherText.trim()}`
      : label;
  }
  if (question.type === "multi_choice" && Array.isArray(answer)) {
    return answer.map((choiceId) => choices.get(String(choiceId)) ?? String(choiceId));
  }
  if (question.type === "multi_choice" && isRecord(answer) && Array.isArray(answer.choices)) {
    return answer.choices.map((choiceId) => {
      const id = String(choiceId);
      const label = choices.get(id) ?? id;
      return isOtherChoice(question, id) && isNonEmptyString(answer.otherText)
        ? `${label}: ${answer.otherText.trim()}`
        : label;
    });
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

export const surveyPayloadForAgent = (responses: SurveyAnswerMap) =>
  allStudyQuestions().map((question) => ({
    questionId: question.id,
    type: question.type,
    label: question.label,
    answer: responses[question.id] ?? null,
    answerLabel: answerLabel(question, responses[question.id]),
  }));

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
