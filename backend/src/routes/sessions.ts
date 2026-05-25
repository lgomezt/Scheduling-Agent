import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { config } from "../config.js";

export const sessionsRouter = Router();

type SessionRow = {
  id: string;
  user_id: number;
  status: string;
  current_scenario_index: number;
  calendar_confirmed_at: string | null;
  created_at: string;
  completed_at: string | null;
};

const toApi = (row: SessionRow) => ({
  id: row.id,
  status: row.status,
  currentScenarioIndex: row.current_scenario_index,
  calendarConfirmedAt: row.calendar_confirmed_at,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

sessionsRouter.post("/", requireAuth, (req, res) => {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO sessions (id, user_id) VALUES (?, ?)").run(id, req.userId);
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
  if (!row) {
    res.json(null);
    return;
  }
  res.json(toApi(row));
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

sessionsRouter.post("/:id/confirm-calendar", requireAuth, (req, res) => {
  const id = String(req.params.id);
  const row = db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(id, req.userId) as SessionRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  db.prepare(
    "UPDATE sessions SET calendar_confirmed_at = datetime('now') WHERE id = ?",
  ).run(id);
  const updated = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow;
  res.json(toApi(updated));
});

sessionsRouter.get("/:id/onboarding", requireAuth, (req, res) => {
  const id = String(req.params.id);
  const row = db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(id, req.userId) as SessionRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const calendarReady = !!row.calendar_confirmed_at;
  const profilePath = path.join(config.dataDir, "profiles", `${id}.initial.md`);
  const legacyPath = path.join(config.dataDir, "profiles", `${id}.md`);
  const profileReady = fs.existsSync(profilePath) || fs.existsSync(legacyPath);
  const scenarioCount = (
    db.prepare("SELECT COUNT(*) AS n FROM scenarios WHERE session_id = ?").get(id) as { n: number }
  ).n;
  const scenariosReady = scenarioCount > 0;
  const nextStep: "calendar" | "profile" | "scenarios" | "complete" = !calendarReady
    ? "calendar"
    : !profileReady
      ? "profile"
      : !scenariosReady
        ? "scenarios"
        : "complete";
  res.json({
    calendarReady,
    profileReady,
    scenariosReady,
    scenarioCount,
    nextStep,
  });
});

sessionsRouter.post("/:id/advance", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId) as SessionRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  db.prepare(
    "UPDATE sessions SET current_scenario_index = current_scenario_index + 1 WHERE id = ?",
  ).run(req.params.id);
  const updated = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id) as SessionRow;
  res.json(toApi(updated));
});
