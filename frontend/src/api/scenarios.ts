import { api } from "./client";
import type { CalendarEvent } from "./calendar";

export type ScenarioOption = {
  id: string;
  label: string;
  suggestedStart: string;
  suggestedEnd: string;
};

export type ContextEvent = { title: string; start: string; end: string };

export type Scenario = {
  id: number;
  orderIndex: number;
  title: string;
  description: string;
  promptSummary: string | null;
  contextEvents: ContextEvent[];
  options: ScenarioOption[] | null;
};

export const getScenarios = (sessionId: string) => api<Scenario[]>(`/api/scenarios/${sessionId}`);

export const placeUserEvent = (
  scenarioId: number,
  start: Date,
  end: Date,
  label?: string,
) =>
  api<CalendarEvent>(`/api/scenarios/place/${scenarioId}`, {
    method: "POST",
    body: JSON.stringify({ start: start.toISOString(), end: end.toISOString(), label }),
  });

export const activateScenario = (scenarioId: number) =>
  api<{ ok: true; contextEventCount: number; anchorIso: string | null }>(
    `/api/scenarios/activate/${scenarioId}`,
    { method: "POST" },
  );
