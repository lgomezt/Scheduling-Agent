import crypto from "node:crypto";
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { z } from "zod";
import { config } from "../config.js";
import { loadStudyPrompt } from "../study/config.js";

let client: GoogleGenerativeAI | null = null;
const getClient = (): GoogleGenerativeAI => {
  if (!config.gemini.apiKey) throw new Error("GEMINI_API_KEY is not set");
  if (!client) client = new GoogleGenerativeAI(config.gemini.apiKey);
  return client;
};

const hashText = (text: string): string => crypto.createHash("sha256").update(text).digest("hex");

const studyModel = (systemPrompt: string, json: boolean): GenerativeModel =>
  getClient().getGenerativeModel({
    model: config.gemini.model,
    systemInstruction: systemPrompt,
    generationConfig: json
      ? { temperature: 0.2, responseMimeType: "application/json" }
      : { temperature: 0.35 },
  });

const parseJsonResponse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) return JSON.parse(fenced[1]);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Model response did not contain a JSON object");
  }
};

const studyRankingItemSchema = z.object({
  optionId: z.string(),
  rank: z.number().int().positive(),
});

const studyRankingSchema = z.object({
  ranking: z.array(studyRankingItemSchema).min(1),
  reasoning: z.string().min(1),
});

export type StudyModelRanking = z.infer<typeof studyRankingSchema>;

export type StudyModelResult<T> = {
  payload: unknown;
  raw: string;
  parsed: T;
  latencyMs: number;
  modelName: string;
  promptName: string;
  systemPromptText: string;
  systemPromptHash: string;
  startedAt: string;
  completedAt: string;
};

export const generateStudyInitialProfile = async (input: {
  promptName: string;
  payload: unknown;
}): Promise<StudyModelResult<string>> => {
  const systemPromptText = loadStudyPrompt(input.promptName);
  const model = studyModel(systemPromptText, false);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = await model.generateContent([
    {
      text:
        "Here are the questionnaire responses available to the full-information agent. Produce the markdown profile now.\n\n" +
        JSON.stringify(input.payload, null, 2),
    },
  ]);
  const raw = result.response.text();
  return {
    payload: input.payload,
    raw,
    parsed: raw,
    latencyMs: Date.now() - started,
    modelName: config.gemini.model,
    promptName: input.promptName,
    systemPromptText,
    systemPromptHash: hashText(systemPromptText),
    startedAt,
    completedAt: new Date().toISOString(),
  };
};

export const generateStudyScenarioRanking = async (input: {
  promptName: string;
  payload: unknown;
}): Promise<StudyModelResult<StudyModelRanking>> => {
  const systemPromptText = loadStudyPrompt(input.promptName);
  const model = studyModel(systemPromptText, true);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = await model.generateContent([
    {
      text:
        "Here is the current scenario payload. Return the JSON ranking object now.\n\n" +
        JSON.stringify(input.payload, null, 2),
    },
  ]);
  const raw = result.response.text();
  const parsed = studyRankingSchema.parse(parseJsonResponse(raw));
  return {
    payload: input.payload,
    raw,
    parsed,
    latencyMs: Date.now() - started,
    modelName: config.gemini.model,
    promptName: input.promptName,
    systemPromptText,
    systemPromptHash: hashText(systemPromptText),
    startedAt,
    completedAt: new Date().toISOString(),
  };
};

export const generateStudyFinalProfile = async (input: {
  promptName: string;
  payload: unknown;
}): Promise<StudyModelResult<string>> => {
  const systemPromptText = loadStudyPrompt(input.promptName);
  const model = studyModel(systemPromptText, false);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = await model.generateContent([
    {
      text:
        "Here is the full end-of-study evidence available to the full-information agent. Produce the final markdown profile now.\n\n" +
        JSON.stringify(input.payload, null, 2),
    },
  ]);
  const raw = result.response.text();
  return {
    payload: input.payload,
    raw,
    parsed: raw,
    latencyMs: Date.now() - started,
    modelName: config.gemini.model,
    promptName: input.promptName,
    systemPromptText,
    systemPromptHash: hashText(systemPromptText),
    startedAt,
    completedAt: new Date().toISOString(),
  };
};
