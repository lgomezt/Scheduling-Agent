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

const exportEvent = (row: EventRow) => ({
  id: row.id,
  source: row.source,
  title: row.title,
  start: row.start_iso,
  end: row.end_iso,
  metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
});

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
    .prepare("SELECT * FROM scenario_answers WHERE session_id = ?")
    .all(sessionId) as AnswerRow[];
  const answerByScenario = new Map<number, AnswerRow>(answers.map((a) => [a.scenario_id, a]));

  const eventsByScenario = new Map<number, EventRow[]>();
  for (const e of events) {
    if (e.scenario_id == null) continue;
    const arr = eventsByScenario.get(e.scenario_id) ?? [];
    arr.push(e);
    eventsByScenario.set(e.scenario_id, arr);
  }

  const eventsBySource: Record<string, ReturnType<typeof exportEvent>[]> = {};
  for (const e of events) {
    (eventsBySource[e.source] ??= []).push(exportEvent(e));
  }

  const scenarioPayload = scenarios.map((s) => {
    const answer = answerByScenario.get(s.id);
    const ownedEvents = eventsByScenario.get(s.id) ?? [];

    const response = answer
      ? {
          answeredAt: answer.created_at,
          userReason: answer.user_reason,
          userActions: answer.user_actions_json ? JSON.parse(answer.user_actions_json) : [],
          agentSummary: answer.agent_reason,
          agentOperations: answer.agent_actions_json ? JSON.parse(answer.agent_actions_json) : [],
          decision: answer.user_decision,
          feedback: answer.user_feedback,
          calendarSnapshot: {
            contextEvents: ownedEvents.filter((e) => e.source === "scenario_context").map(exportEvent),
            userEvents: ownedEvents.filter((e) => e.source === "scenario_user").map(exportEvent),
            agentEvents: ownedEvents.filter((e) => e.source === "scenario_agent").map(exportEvent),
          },
        }
      : null;

    return {
      id: s.id,
      orderIndex: s.order_index,
      title: s.title,
      description: s.description,
      promptSummary: s.prompt_summary,
      contextEvents: s.context_events_json ? JSON.parse(s.context_events_json) : [],
      options: s.options_json ? JSON.parse(s.options_json) : null,
      response,
    };
  });

  const payload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      status: session.status,
      createdAt: session.created_at,
      completedAt: session.completed_at,
    },
    user,
    profile: {
      initial: profileInitial,
      current: profileCurrent,
      edited: !!profileInitial && !!profileCurrent && profileInitial !== profileCurrent,
    },
    scenarios: scenarioPayload,
    calendarEvents: eventsBySource,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="scheduling-agent-${sessionId}.json"`,
  );
  res.send(JSON.stringify(payload, null, 2));
});
