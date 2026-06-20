import { api } from "./client";
import type { CalendarEvent } from "./calendar";
import type { ScenarioOption, StudyScenario } from "./study";
import { getScenarioState } from "./study";

export type ContextEvent = { title: string; start: string; end: string };

export type Scenario = StudyScenario;

export const getScenarios = async (sessionId: string) => {
  const state = await getScenarioState(sessionId);
  return state.scenarios;
};

export const placeUserEvent = (
  scenarioId: number | string,
  start: Date,
  end: Date,
  label?: string,
) =>
  api<CalendarEvent>(`/api/scenarios/place/${scenarioId}`, {
    method: "POST",
    body: JSON.stringify({ start: start.toISOString(), end: end.toISOString(), label }),
  });

export const activateScenario = (scenarioId: number | string) =>
  api<{ ok: true; contextEventCount: number; anchorIso: string | null }>(
    `/api/scenarios/activate/${scenarioId}`,
    { method: "POST" },
  );

export type { ScenarioOption };
