import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { listGoogleEvents } from "../services/google-calendar.js";

export const calendarRouter = Router();

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

const toApi = (row: EventRow) => ({
  id: row.id,
  source: row.source,
  externalId: row.external_id,
  title: row.title,
  start: row.start_iso,
  end: row.end_iso,
  scenarioId: row.scenario_id,
  metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
});

const sessionForUser = (sessionId: string, userId: number) =>
  db
    .prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as { id: string } | undefined;

const activeScenarioFor = (sessionId: string): { id: number } | undefined => {
  const sess = db
    .prepare(
      "SELECT current_scenario_index, status FROM sessions WHERE id = ?",
    )
    .get(sessionId) as { current_scenario_index: number; status: string } | undefined;
  if (!sess || sess.status !== "in_progress") return undefined;
  return db
    .prepare("SELECT id FROM scenarios WHERE session_id = ? AND order_index = ?")
    .get(sessionId, sess.current_scenario_index) as { id: number } | undefined;
};

calendarRouter.get("/:sessionId", requireAuth, async (req, res) => {
  const sessionId = String(req.params.sessionId);
  if (!sessionForUser(sessionId, req.userId!)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { weekStart, weekEnd } = req.query as { weekStart?: string; weekEnd?: string };
  if (!weekStart || !weekEnd) {
    res.status(400).json({ error: "weekStart and weekEnd required (ISO datetimes)" });
    return;
  }

  try {
    const synced = await listGoogleEvents(req.userId!, weekStart, weekEnd);
    if (synced.length > 0) {
      const existing = db
        .prepare(
          "SELECT external_id FROM calendar_events WHERE session_id = ? AND external_id IS NOT NULL",
        )
        .all(sessionId) as { external_id: string }[];
      const tombstones = db
        .prepare("SELECT external_id FROM sync_tombstones WHERE session_id = ?")
        .all(sessionId) as { external_id: string }[];
      const skip = new Set([
        ...existing.map((r) => r.external_id),
        ...tombstones.map((r) => r.external_id),
      ]);
      const insert = db.prepare(
        `INSERT INTO calendar_events (session_id, source, external_id, title, start_iso, end_iso)
         VALUES (?, 'google', ?, ?, ?, ?)`,
      );
      const tx = db.transaction(() => {
        for (const s of synced) {
          if (s.externalId && !skip.has(s.externalId)) {
            insert.run(sessionId, s.externalId, s.title, s.startIso, s.endIso);
          }
        }
      });
      tx();
    }
  } catch (err) {
    console.warn("Google Calendar fetch failed:", (err as Error).message);
  }

  const rows = db
    .prepare(
      `SELECT * FROM calendar_events
       WHERE session_id = ? AND start_iso < ? AND end_iso > ?
       ORDER BY start_iso`,
    )
    .all(sessionId, weekEnd, weekStart) as EventRow[];

  res.json(rows.map(toApi));
});

const createEventSchema = z.object({
  title: z.string().min(1),
  start: z.string(),
  end: z.string(),
});

calendarRouter.post("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  if (!sessionForUser(sessionId, req.userId!)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { title, start, end } = parsed.data;
  const active = activeScenarioFor(sessionId);
  const source = active ? "scenario_user" : "manual";
  const scenarioId = active ? active.id : null;
  const metadata = active
    ? JSON.stringify({ origin: "scenario_user_created" })
    : null;
  const result = db
    .prepare(
      `INSERT INTO calendar_events (session_id, source, title, start_iso, end_iso, scenario_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sessionId, source, title, start, end, scenarioId, metadata);
  const row = db
    .prepare("SELECT * FROM calendar_events WHERE id = ?")
    .get(result.lastInsertRowid) as EventRow;
  res.json(toApi(row));
});

calendarRouter.delete("/:sessionId/:eventId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  const eventId = String(req.params.eventId);
  if (!sessionForUser(sessionId, req.userId!)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const ev = db
    .prepare("SELECT external_id FROM calendar_events WHERE id = ? AND session_id = ?")
    .get(eventId, sessionId) as { external_id: string | null } | undefined;
  if (ev?.external_id) {
    db.prepare(
      "INSERT OR IGNORE INTO sync_tombstones (session_id, external_id) VALUES (?, ?)",
    ).run(sessionId, ev.external_id);
  }
  db.prepare("DELETE FROM calendar_events WHERE id = ? AND session_id = ?").run(eventId, sessionId);
  res.status(204).end();
});

const updateSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  title: z.string().optional(),
});

calendarRouter.patch("/:sessionId/:eventId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  const eventId = String(req.params.eventId);
  if (!sessionForUser(sessionId, req.userId!)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const sets: string[] = [];
  const values: Array<string> = [];
  if (parsed.data.start !== undefined) {
    sets.push("start_iso = ?");
    values.push(parsed.data.start);
  }
  if (parsed.data.end !== undefined) {
    sets.push("end_iso = ?");
    values.push(parsed.data.end);
  }
  if (parsed.data.title !== undefined) {
    sets.push("title = ?");
    values.push(parsed.data.title);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const result = db
    .prepare(
      `UPDATE calendar_events SET ${sets.join(", ")} WHERE id = ? AND session_id = ?`,
    )
    .run(...values, eventId, sessionId);
  if (result.changes === 0) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const row = db
    .prepare("SELECT * FROM calendar_events WHERE id = ?")
    .get(eventId) as EventRow;
  res.json(toApi(row));
});
