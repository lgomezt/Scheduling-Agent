import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { getStudyConfig } from "../study/config.js";

export const sessionsRouter = Router();

type SessionRow = {
  id: string;
  user_id: number;
  status: string;
  current_scenario_index: number;
  participant_code: string | null;
  study_version: string | null;
  created_at: string;
  completed_at: string | null;
};

const toApi = (row: SessionRow) => ({
  id: row.id,
  status: row.status,
  currentScenarioIndex: row.current_scenario_index,
  participantCode: row.participant_code,
  studyVersion: row.study_version,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

sessionsRouter.post("/", requireAuth, (req, res) => {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO sessions (id, user_id, study_version) VALUES (?, ?, ?)").run(
    id,
    req.userId,
    getStudyConfig().version,
  );
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow;
  res.json(toApi(row));
});

sessionsRouter.get("/current", requireAuth, (req, res) => {
  const row = db
    .prepare(
      `SELECT * FROM sessions
       WHERE user_id = ? AND status = 'in_progress'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(req.userId) as SessionRow | undefined;
  res.json(row ? toApi(row) : null);
});

sessionsRouter.get("/latest", requireAuth, (req, res) => {
  const row = db
    .prepare(
      `SELECT * FROM sessions
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(req.userId) as SessionRow | undefined;
  res.json(row ? toApi(row) : null);
});

sessionsRouter.get("/:id", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId) as SessionRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(toApi(row));
});

sessionsRouter.post("/:id/complete", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId) as SessionRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  db.prepare(
    "UPDATE sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
  ).run(req.params.id);
  const updated = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id) as SessionRow;
  res.json(toApi(updated));
});

sessionsRouter.delete("/:id", requireAuth, (req, res) => {
  const id = String(req.params.id);
  const row = db
    .prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?")
    .get(id, req.userId) as { id: string } | undefined;
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  res.json({ ok: true });
});
