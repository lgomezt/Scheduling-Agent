import fs from "node:fs";
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { z } from "zod";
import { config } from "../config.js";
import { loadPrompt } from "./prompts.js";

let client: GoogleGenerativeAI | null = null;
const getClient = (): GoogleGenerativeAI => {
  if (!config.gemini.apiKey) throw new Error("GEMINI_API_KEY is not set");
  if (!client) client = new GoogleGenerativeAI(config.gemini.apiKey);
  return client;
};

const textModel = (systemPrompt: string, json: boolean): GenerativeModel =>
  getClient().getGenerativeModel({
    model: config.gemini.model,
    systemInstruction: systemPrompt,
    generationConfig: json
      ? { temperature: 0.3, responseMimeType: "application/json" }
      : { temperature: 0.4 },
  });

const pdfPart = (pdfPath: string) => ({
  inlineData: {
    data: fs.readFileSync(pdfPath).toString("base64"),
    mimeType: "application/pdf",
  },
});

export const pdfToProfile = async (pdfPath: string): Promise<string> => {
  const model = textModel(loadPrompt("profile"), false);
  const result = await model.generateContent([
    pdfPart(pdfPath),
    { text: "Produce the markdown profile now, following the instructions above." },
  ]);
  return result.response.text();
};

const optionSchema = z.object({
  label: z.string(),
  suggested_start: z.string(),
  suggested_end: z.string(),
});

const contextEventSchema = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string(),
});

const scenarioSchema = z.object({
  title: z.string(),
  description: z.string(),
  prompt_summary: z.string().optional().default(""),
  context_events: z.array(contextEventSchema).optional().default([]),
  options: z.array(optionSchema).optional(),
});

const scenariosResponseSchema = z.object({ scenarios: z.array(scenarioSchema) });

export type ParsedScenario = z.infer<typeof scenarioSchema>;

export type ScenarioGenContext = {
  currentWeek: { mondayIso: string; sundayIso: string; timezoneHint: string };
  existingEvents: Array<{ title: string; start: string; end: string }>;
};

export const pdfToScenarios = async (
  pdfPath: string,
  context: ScenarioGenContext,
): Promise<ParsedScenario[]> => {
  const model = textModel(loadPrompt("scenarios"), true);
  const ctxPayload = JSON.stringify(
    {
      current_week: {
        monday_iso: context.currentWeek.mondayIso,
        sunday_iso: context.currentWeek.sundayIso,
        timezone_hint: context.currentWeek.timezoneHint,
      },
      existing_events: context.existingEvents,
    },
    null,
    2,
  );
  const result = await model.generateContent([
    pdfPart(pdfPath),
    {
      text:
        "Here is the participant's current week and the events already on their calendar. Use them to anchor and avoid overlaps.\n\n" +
        ctxPayload +
        "\n\nNow extract scenarios as JSON.",
    },
  ]);
  const text = result.response.text();
  const parsed = scenariosResponseSchema.parse(JSON.parse(text));
  return parsed.scenarios;
};

const moveOpSchema = z.object({
  op: z.literal("move"),
  context_index: z.number().int().nonnegative(),
  new_title: z.string().optional(),
  new_start: z.string(),
  new_end: z.string(),
  reason: z.string(),
});

const createOpSchema = z.object({
  op: z.literal("create"),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  reason: z.string(),
});

const deleteOpSchema = z.object({
  op: z.literal("delete"),
  context_index: z.number().int().nonnegative(),
  reason: z.string(),
});

const noChangeOpSchema = z.object({
  op: z.literal("no_change"),
  reason: z.string(),
});

const opSchema = z.union([moveOpSchema, createOpSchema, deleteOpSchema, noChangeOpSchema]);

const proposalSchema = z.object({
  summary: z.string(),
  operations: z.array(opSchema),
});

export type AgentOp = z.infer<typeof opSchema>;
export type AgentProposal = z.infer<typeof proposalSchema>;

export type CalendarEventLite = {
  source: string;
  title: string;
  start: string;
  end: string;
};

export type ScenarioContextLite = {
  context_index: number;
  title: string;
  start: string;
  end: string;
};

export type SchedulerInput = {
  profileMarkdown: string;
  calendarEvents: CalendarEventLite[];
  scenarioContext: ScenarioContextLite[];
  scenario: { title: string; description: string; promptSummary?: string };
  timezone?: string;
};

export const proposeChoice = async (input: SchedulerInput): Promise<AgentProposal> => {
  const model = textModel(loadPrompt("scheduler"), true);
  const userPayload = {
    profile_markdown: input.profileMarkdown,
    scenario_context: input.scenarioContext,
    other_calendar_events: input.calendarEvents,
    scenario: input.scenario,
    timezone: input.timezone ?? "Europe/Rome",
  };
  const result = await model.generateContent([
    {
      text:
        "Here is the participant context and the scenario. Emit the JSON object now.\n\n" +
        JSON.stringify(userPayload, null, 2),
    },
  ]);
  return proposalSchema.parse(JSON.parse(result.response.text()));
};
