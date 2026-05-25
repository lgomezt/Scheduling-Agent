import { db } from "../db/client.js";

export type ContextEvent = { title: string; start: string; end: string };

export type Op =
  | { op: "move"; contextIndex: number; originalTitle: string; originalStart: string; originalEnd: string; newTitle: string; newStart: string; newEnd: string }
  | { op: "delete"; contextIndex: number; originalTitle: string; originalStart: string; originalEnd: string }
  | { op: "create"; title: string; start: string; end: string }
  | { op: "no_change" };

type ScenarioRow = { id: number; context_events_json: string | null };

type EventRow = {
  id: number;
  source: string;
  title: string;
  start_iso: string;
  end_iso: string;
  metadata_json: string | null;
};

const parseMeta = (raw: string | null): { contextIndex?: number; origin?: string } => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { contextIndex?: number; origin?: string };
  } catch {
    return {};
  }
};

export const diffUserActions = (scenarioId: number | string): Op[] => {
  const scenario = db
    .prepare("SELECT id, context_events_json FROM scenarios WHERE id = ?")
    .get(scenarioId) as ScenarioRow | undefined;
  if (!scenario) return [];

  const initial: ContextEvent[] = scenario.context_events_json
    ? (JSON.parse(scenario.context_events_json) as ContextEvent[])
    : [];

  const currentRows = db
    .prepare(
      `SELECT id, source, title, start_iso, end_iso, metadata_json
       FROM calendar_events
       WHERE scenario_id = ?
         AND source IN ('scenario_context', 'scenario_user')`,
    )
    .all(scenarioId) as EventRow[];

  const byContextIndex = new Map<number, EventRow>();
  const standalone: EventRow[] = [];
  for (const row of currentRows) {
    const meta = parseMeta(row.metadata_json);
    if (row.source === "scenario_context" && typeof meta.contextIndex === "number") {
      byContextIndex.set(meta.contextIndex, row);
    } else {
      standalone.push(row);
    }
  }

  const ops: Op[] = [];

  initial.forEach((ev, idx) => {
    const current = byContextIndex.get(idx);
    if (!current) {
      ops.push({
        op: "delete",
        contextIndex: idx,
        originalTitle: ev.title,
        originalStart: ev.start,
        originalEnd: ev.end,
      });
      return;
    }
    if (
      current.start_iso !== ev.start ||
      current.end_iso !== ev.end ||
      current.title !== ev.title
    ) {
      ops.push({
        op: "move",
        contextIndex: idx,
        originalTitle: ev.title,
        originalStart: ev.start,
        originalEnd: ev.end,
        newTitle: current.title,
        newStart: current.start_iso,
        newEnd: current.end_iso,
      });
    }
  });

  for (const row of standalone) {
    if (row.source !== "scenario_user") continue;
    ops.push({
      op: "create",
      title: row.title,
      start: row.start_iso,
      end: row.end_iso,
    });
  }

  if (ops.length === 0) ops.push({ op: "no_change" });
  return ops;
};
