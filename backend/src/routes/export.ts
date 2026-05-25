import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { config } from "../config.js";

export const exportRouter = Router();

type SessionRow = {
  id: string;
  user_id: number;
  status: string;
  current_scenario_index: number;
  created_at: string;
  completed_at: string | null;
};

type UserRow = { id: number; email: string; name: string };

type ScenarioRow = {
  id: number;
  order_index: number;
  title: string;
  description: string;
  options_json: string | null;
  context_events_json: string | null;
  prompt_summary: string | null;
};

type EventRow = {
  id: number;
  source: string;
  external_id: string | null;
  title: string;
  start_iso: string;
  end_iso: string;
  scenario_id: number | null;
  metadata_json: string | null;
};

type AnswerRow = {
  id: number;
  scenario_id: number;
  user_event_id: number | null;
  user_reason: string;
  agent_event_id: number | null;
  agent_reason: string;
  user_decision: string;
  user_feedback: string | null;
  user_actions_json: string | null;
  agent_actions_json: string | null;
  created_at: string;
};

exportRouter.get("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, req.userId) as SessionRow | undefined;
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const user = db
    .prepare("SELECT id, email, name FROM users WHERE id = ?")
    .get(session.user_id) as UserRow;

  const profileDir = path.join(config.dataDir, "profiles");
  const readIfExists = (p: string): string | null =>
    fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  const profileInitial =
    readIfExists(path.join(profileDir, `${sessionId}.initial.md`)) ??
    readIfExists(path.join(profileDir, `${sessionId}.md`));
  const profileCurrent =
    readIfExists(path.join(profileDir, `${sessionId}.current.md`)) ?? profileInitial;

  const scenarios = db
    .prepare("SELECT * FROM scenarios WHERE session_id = ? ORDER BY order_index")
    .all(sessionId) as ScenarioRow[];

  const events = db
    .prepare("SELECT * FROM calendar_events WHERE session_id = ? ORDER BY start_iso")
    .all(sessionId) as EventRow[];

  const answers = db
    .prepare("SELECT * FROM scenario_answers WHERE session_id = ? ORDER BY created_at")
    .all(sessionId) as AnswerRow[];

  const eventById = new Map<number, EventRow>(events.map((e) => [e.id, e]));

  const exportEvent = (row: EventRow | undefined) =>
    row
      ? {
          id: row.id,
          source: row.source,
          title: row.title,
          start: row.start_iso,
          end: row.end_iso,
          metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
        }
      : null;

  const eventsBySource: Record<string, ReturnType<typeof exportEvent>[]> = {};
  for (const e of events) {
    (eventsBySource[e.source] ??= []).push(exportEvent(e));
  }

  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      status: session.status,
      createdAt: session.created_at,
      completedAt: session.completed_at,
    },
    user,
    profileMarkdownInitial: profileInitial,
    profileMarkdownCurrent: profileCurrent,
    profileEdited: !!profileInitial && !!profileCurrent && profileInitial !== profileCurrent,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      orderIndex: s.order_index,
      title: s.title,
      description: s.description,
      promptSummary: s.prompt_summary,
      contextEvents: s.context_events_json ? JSON.parse(s.context_events_json) : [],
      options: s.options_json ? JSON.parse(s.options_json) : null,
    })),
    answers: answers.map((a) => ({
      scenarioId: a.scenario_id,
      userReason: a.user_reason,
      userActions: a.user_actions_json ? JSON.parse(a.user_actions_json) : [],
      agentSummary: a.agent_reason,
      agentActions: a.agent_actions_json ? JSON.parse(a.agent_actions_json) : [],
      userDecision: a.user_decision,
      userFeedback: a.user_feedback,
      answeredAt: a.created_at,
    })),
    calendarEvents: eventsBySource,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="scheduling-agent-${sessionId}.json"`,
  );
  res.send(JSON.stringify(payload, null, 2));
});
