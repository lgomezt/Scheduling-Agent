import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";

export const scenariosRouter = Router();

type ScenarioRow = {
  id: number;
  session_id: string;
  order_index: number;
  title: string;
  description: string;
  options_json: string | null;
  context_events_json: string | null;
  prompt_summary: string | null;
};

type EventRow = {
  id: number;
  session_id: string;
  source: string;
  external_id: string | null;
  title: string;
  start_iso: string;
  end_iso: string;
  scenario_id: number | null;
  metadata_json: string | null;
};

const toApi = (row: ScenarioRow) => ({
  id: row.id,
  orderIndex: row.order_index,
  title: row.title,
  description: row.description,
  promptSummary: row.prompt_summary,
  contextEvents: row.context_events_json ? JSON.parse(row.context_events_json) : [],
  options: row.options_json ? JSON.parse(row.options_json) : null,
});

const eventToApi = (row: EventRow) => ({
  id: row.id,
  source: row.source,
  externalId: row.external_id,
  title: row.title,
  start: row.start_iso,
  end: row.end_iso,
  scenarioId: row.scenario_id,
  metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
});

const scenarioOwnedByUser = (scenarioId: string, userId: number) =>
  db
    .prepare(
      `SELECT s.id, s.session_id, s.title FROM scenarios s
       JOIN sessions sess ON sess.id = s.session_id
       WHERE s.id = ? AND sess.user_id = ?`,
    )
    .get(scenarioId, userId) as { id: number; session_id: string; title: string } | undefined;

scenariosRouter.get("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  const owned = db
    .prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, req.userId) as { id: string } | undefined;
  if (!owned) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const rows = db
    .prepare("SELECT * FROM scenarios WHERE session_id = ? ORDER BY order_index")
    .all(sessionId) as ScenarioRow[];
  res.json(rows.map(toApi));
});

const placeSchema = z.object({
  start: z.string(),
  end: z.string(),
  label: z.string().optional(),
});

type ContextEvent = { title: string; start: string; end: string };

const rebaseToCurrentWeek = (iso: string): string => {
  const original = new Date(iso);
  if (Number.isNaN(original.getTime())) return iso;
  const dow = (original.getDay() + 6) % 7; // 0 = Monday
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - todayDow);
  monday.setHours(0, 0, 0, 0);
  const target = new Date(monday);
  target.setDate(monday.getDate() + dow);
  target.setHours(original.getHours(), original.getMinutes(), 0, 0);
  return target.toISOString();
};

scenariosRouter.post("/activate/:scenarioId", requireAuth, (req, res) => {
  const scenarioId = String(req.params.scenarioId);
  const scenario = scenarioOwnedByUser(scenarioId, req.userId!) as
    | { id: number; session_id: string; title: string }
    | undefined;
  if (!scenario) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }

  const row = db
    .prepare("SELECT context_events_json FROM scenarios WHERE id = ?")
    .get(scenarioId) as { context_events_json: string | null } | undefined;
  const contextEvents: ContextEvent[] = row?.context_events_json
    ? (JSON.parse(row.context_events_json) as ContextEvent[])
    : [];

  db.prepare(
    `DELETE FROM calendar_events
     WHERE session_id = ?
       AND source = 'scenario_context'
       AND (scenario_id IS NULL OR scenario_id != ?)`,
  ).run(scenario.session_id, scenarioId);

  const already = db
    .prepare(
      "SELECT COUNT(*) AS n FROM calendar_events WHERE source = 'scenario_context' AND scenario_id = ?",
    )
    .get(scenarioId) as { n: number };

  if (already.n === 0 && contextEvents.length > 0) {
    const insert = db.prepare(
      `INSERT INTO calendar_events
       (session_id, source, title, start_iso, end_iso, scenario_id, metadata_json)
       VALUES (?, 'scenario_context', ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction((items: ContextEvent[]) => {
      items.forEach((e, idx) => {
        const rebStart = rebaseToCurrentWeek(e.start);
        const rebEnd = rebaseToCurrentWeek(e.end);
        insert.run(
          scenario.session_id,
          e.title,
          rebStart,
          rebEnd,
          scenarioId,
          JSON.stringify({
            origin: "scenario_context",
            contextIndex: idx,
            originalTitle: e.title,
            originalStart: rebStart,
            originalEnd: rebEnd,
          }),
        );
      });
    });
    tx(contextEvents);
  }

  const first = contextEvents[0];
  res.json({
    ok: true,
    contextEventCount: contextEvents.length,
    anchorIso: first ? rebaseToCurrentWeek(first.start) : null,
  });
});

scenariosRouter.post("/place/:scenarioId", requireAuth, (req, res) => {
  const scenarioId = String(req.params.scenarioId);
  const scenario = scenarioOwnedByUser(scenarioId, req.userId!);
  if (!scenario) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  const parsed = placeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  db.prepare(
    "DELETE FROM calendar_events WHERE scenario_id = ? AND source = 'scenario_user'",
  ).run(scenarioId);

  const title = parsed.data.label
    ? `${scenario.title} — ${parsed.data.label}`
    : `${scenario.title} (your pick)`;
  const result = db
    .prepare(
      `INSERT INTO calendar_events (session_id, source, title, start_iso, end_iso, scenario_id, metadata_json)
       VALUES (?, 'scenario_user', ?, ?, ?, ?, ?)`,
    )
    .run(
      scenario.session_id,
      title,
      parsed.data.start,
      parsed.data.end,
      scenarioId,
      parsed.data.label ? JSON.stringify({ label: parsed.data.label }) : null,
    );
  const row = db
    .prepare("SELECT * FROM calendar_events WHERE id = ?")
    .get(result.lastInsertRowid) as EventRow;
  res.json(eventToApi(row));
});
