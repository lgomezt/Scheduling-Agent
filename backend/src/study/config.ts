import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const studyDir = path.dirname(fileURLToPath(import.meta.url));

const choiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  isOther: z.boolean().optional(),
});

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "textarea", "single_choice", "multi_choice", "scale"]),
  label: z.string().min(1),
  helpText: z.string().optional(),
  required: z.boolean().default(true),
  choices: z.array(choiceSchema).optional(),
  maxSelections: z.number().int().positive().optional(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
});

const questionnaireSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  questions: z.array(questionSchema).min(1),
});

const scenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(choiceSchema).min(2),
  reasoningPrompt: z.string().min(1),
  informationNeedsPrompt: z.string().min(1),
  conditionalChangePrompt: z.string().min(1),
});

const agentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  initialProfilePrompt: z.string().min(1),
  scenarioPrompt: z.string().min(1),
  finalProfilePrompt: z.string().min(1),
});

const finalReflectionSchema = z.object({
  enabled: z.boolean(),
  scorePrompt: z.string().min(1),
  commentPrompt: z.string().min(1),
});

const studyConfigSchema = z.object({
  version: z.string().min(1),
  title: z.string().min(1),
  questionnaires: z.array(questionnaireSchema).min(1),
  scenarios: z.array(scenarioSchema).min(1),
  agent: agentSchema,
  finalProfileReflection: finalReflectionSchema,
});

export type StudyChoice = z.infer<typeof choiceSchema>;
export type StudyQuestion = z.infer<typeof questionSchema>;
export type StudyQuestionnaire = z.infer<typeof questionnaireSchema>;
export type StudyScenario = z.infer<typeof scenarioSchema>;
export type StudyAgent = z.infer<typeof agentSchema>;
export type StudyConfig = z.infer<typeof studyConfigSchema>;

const requireUnique = (values: string[], label: string) => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  if (dupes.size > 0) {
    throw new Error(`Invalid study config: duplicate ${label}: ${[...dupes].join(", ")}`);
  }
};

const validatePromptExists = (promptName: string) => {
  const promptPath = path.join(studyDir, "prompts", `${promptName}.md`);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Invalid study config: prompt file not found for "${promptName}"`);
  }
};

const validateConfig = (config: StudyConfig): StudyConfig => {
  requireUnique(config.questionnaires.map((q) => q.id), "questionnaire ids");

  const allQuestions = config.questionnaires.flatMap((section) => section.questions);
  requireUnique(allQuestions.map((q) => q.id), "question ids");

  const questionIds = new Set(allQuestions.map((q) => q.id));
  for (const question of allQuestions) {
    if (question.type === "single_choice" || question.type === "multi_choice") {
      if (!question.choices || question.choices.length === 0) {
        throw new Error(`Invalid study config: ${question.id} requires choices`);
      }
      requireUnique(question.choices.map((c) => c.id), `choice ids for ${question.id}`);
    }
    if (question.type === "multi_choice") {
      if (question.maxSelections && question.choices && question.maxSelections > question.choices.length) {
        throw new Error(`Invalid study config: ${question.id} maxSelections exceeds choice count`);
      }
    }
    if (question.type === "scale") {
      if (typeof question.min !== "number" || typeof question.max !== "number" || question.min >= question.max) {
        throw new Error(`Invalid study config: ${question.id} scale needs min < max`);
      }
    }
  }

  requireUnique(config.scenarios.map((s) => s.id), "scenario ids");
  for (const scenario of config.scenarios) {
    requireUnique(scenario.options.map((o) => o.id), `option ids for ${scenario.id}`);
    if (scenario.options.length !== 5) {
      throw new Error(`Invalid study config: ${scenario.id} must have exactly 5 ranking options`);
    }
  }

  for (const promptName of [
    config.agent.initialProfilePrompt,
    config.agent.scenarioPrompt,
    config.agent.finalProfilePrompt,
  ]) {
    validatePromptExists(promptName);
  }

  return config;
};

let cachedConfig: StudyConfig | null = null;

export const getStudyConfig = (): StudyConfig => {
  if (cachedConfig) return cachedConfig;
  const rawPath = path.join(studyDir, "study-config.json");
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8")) as unknown;
  cachedConfig = validateConfig(studyConfigSchema.parse(raw));
  return cachedConfig;
};

export const getVisibleStudyConfig = () => {
  const config = getStudyConfig();
  return {
    version: config.version,
    title: config.title,
    questionnaires: config.questionnaires,
    scenarios: config.scenarios.map((scenario) => ({
      ...scenario,
      description: scenario.prompt,
      promptSummary: null,
      contextEvents: [],
      options: scenario.options.map((option) => ({
        ...option,
        suggestedStart: "",
        suggestedEnd: "",
      })),
    })),
    agent: {
      id: config.agent.id,
      label: config.agent.label,
      description: config.agent.description,
    },
    finalProfileReflection: config.finalProfileReflection,
  };
};

export const loadStudyPrompt = (name: string): string =>
  fs.readFileSync(path.join(studyDir, "prompts", `${name}.md`), "utf8");

export const allStudyQuestions = (): StudyQuestion[] =>
  getStudyConfig().questionnaires.flatMap((section) => section.questions);

export const studyQuestionById = (questionId: string): StudyQuestion | undefined =>
  allStudyQuestions().find((question) => question.id === questionId);

export const scenarioById = (scenarioId: string): StudyScenario | undefined =>
  getStudyConfig().scenarios.find((scenario) => scenario.id === scenarioId);

export const scenarioIndexById = (scenarioId: string): number =>
  getStudyConfig().scenarios.findIndex((scenario) => scenario.id === scenarioId);
