import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { config } from "../config.js";
import {
  proposeChoice,
  type CalendarEventLite,
  type ScenarioContextLite,
  type AgentOp,
} from "../services/gemini.js";
import { listGoogleEvents } from "../services/google-calendar.js";
import { diffUserActions } from "../services/scenario-diff.js";

export const agentRouter = Router();

type ScenarioRow = {
  id: number;
  session_id: string;
  title: string;
  description: string;
  options_json: string | null;
  prompt_summary: string | null;
  context_events_json: string | null;
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

const scenarioForUser = (scenarioId: string, userId: number): ScenarioRow | undefined =>
  db
    .prepare(
      `SELECT s.* FROM scenarios s
       JOIN sessions sess ON sess.id = s.session_id
       WHERE s.id = ? AND sess.user_id = ?`,
    )
    .get(scenarioId, userId) as ScenarioRow | undefined;

const profileMarkdown = (sessionId: string): string => {
  const current = path.join(config.dataDir, "profiles", `${sessionId}.current.md`);
  if (fs.existsSync(current)) return fs.readFileSync(current, "utf8");
  const legacy = path.join(config.dataDir, "profiles", `${sessionId}.md`);
  if (fs.existsSync(legacy)) return fs.readFileSync(legacy, "utf8");
  const initial = path.join(config.dataDir, "profiles", `${sessionId}.initial.md`);
  if (fs.existsSync(initial)) return fs.readFileSync(initial, "utf8");
  return "(no profile available)";
};

const weekBoundsAround = (iso: string): { start: string; end: string } => {
  const ref = new Date(iso);
  const day = ref.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  const monday = new Date(ref);
  monday.setUTCDate(ref.getUTCDate() - mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  const next = new Date(monday);
  next.setUTCDate(monday.getUTCDate() + 7);
  return { start: monday.toISOString(), end: next.toISOString() };
};

const proposeSchema = z.object({
  userReason: z.string().optional(),
});

type ContextEvent = { title: string; start: string; end: string };

const anchorIsoFromContext = (events: ContextEvent[]): string =>
  events[0]?.start ?? new Date().toISOString();

agentRouter.post("/propose/:scenarioId", requireAuth, async (req, res) => {
  const scenarioId = String(req.params.scenarioId);
  const scenario = scenarioForUser(scenarioId, req.userId!);
  if (!scenario) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  const parsed = proposeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const contextEvents: ContextEvent[] = scenario.context_events_json
    ? (JSON.parse(scenario.context_events_json) as ContextEvent[])
    : [];

  const { start: weekStart, end: weekEnd } = weekBoundsAround(anchorIsoFromContext(contextEvents));

  const localEvents = db
    .prepare(
      `SELECT * FROM calendar_events
       WHERE session_id = ? AND start_iso < ? AND end_iso > ?
         AND NOT (scenario_id = ? AND source IN ('scenario_context', 'scenario_user', 'scenario_agent'))
       ORDER BY start_iso`,
    )
    .all(scenario.session_id, weekEnd, weekStart, scenarioId) as EventRow[];

  let googleEvents: CalendarEventLite[] = [];
  try {
    const synced = await listGoogleEvents(req.userId!, weekStart, weekEnd);
    googleEvents = synced.map((s) => ({
      source: "google",
      title: s.title,
      start: s.startIso,
      end: s.endIso,
    }));
  } catch (err) {
    console.warn("Google sync for agent context failed:", (err as Error).message);
  }

  const otherCalendarEvents: CalendarEventLite[] = [
    ...localEvents.map((e) => ({
      source: e.source,
      title: e.title,
      start: e.start_iso,
      end: e.end_iso,
    })),
    ...googleEvents,
  ];

  const scenarioContextLite: ScenarioContextLite[] = contextEvents.map((e, i) => ({
    context_index: i,
    title: e.title,
    start: e.start,
    end: e.end,
  }));

  try {
    const proposal = await proposeChoice({
      profileMarkdown: profileMarkdown(scenario.session_id),
      calendarEvents: otherCalendarEvents,
      scenarioContext: scenarioContextLite,
      scenario: {
        title: scenario.title,
        description: scenario.description,
        promptSummary: scenario.prompt_summary ?? undefined,
      },
    });

    db.prepare(
      "DELETE FROM calendar_events WHERE scenario_id = ? AND source = 'scenario_agent'",
    ).run(scenarioId);

    const insertAgentEvent = db.prepare(
      `INSERT INTO calendar_events (session_id, source, title, start_iso, end_iso, scenario_id, metadata_json)
       VALUES (?, 'scenario_agent', ?, ?, ?, ?, ?)`,
    );

    const agentEvents: ReturnType<typeof eventToApi>[] = [];
    for (let i = 0; i < proposal.operations.length; i++) {
      const op = proposal.operations[i];
      if (op.op === "create") {
        const r = insertAgentEvent.run(
          scenario.session_id,
          op.title,
          op.start,
          op.end,
          scenarioId,
          JSON.stringify({ origin: "scenario_agent", opIndex: i, opKind: "create", reason: op.reason }),
        );
        const row = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(r.lastInsertRowid) as EventRow;
        agentEvents.push(eventToApi(row));
      } else if (op.op === "move") {
        const original = contextEvents[op.context_index];
        const title = op.new_title ?? original?.title ?? "(agent move)";
        const r = insertAgentEvent.run(
          scenario.session_id,
          `${title} → agent's pick`,
          op.new_start,
          op.new_end,
          scenarioId,
          JSON.stringify({
            origin: "scenario_agent",
            opIndex: i,
            opKind: "move",
            contextIndex: op.context_index,
            reason: op.reason,
          }),
        );
        const row = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(r.lastInsertRowid) as EventRow;
        agentEvents.push(eventToApi(row));
      }
      // delete and no_change ops are not materialized as calendar rows
    }

    res.json({
      summary: proposal.summary,
      operations: proposal.operations as AgentOp[],
      agentEvents,
      contextEvents: scenarioContextLite,
    });
  } catch (err) {
    console.error("Agent propose failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

const answerSchema = z.object({
  userReason: z.string().min(1),
  agentSummary: z.string(),
  agentActions: z.array(z.unknown()),
  decision: z.enum(["accept", "critique"]),
  feedback: z.string().optional(),
});

agentRouter.post("/answer/:scenarioId", requireAuth, (req, res) => {
  const scenarioId = String(req.params.scenarioId);
  const scenario = scenarioForUser(scenarioId, req.userId!);
  if (!scenario) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userActions = diffUserActions(scenarioId);

  db.prepare("DELETE FROM scenario_answers WHERE scenario_id = ?").run(scenarioId);
  db.prepare(
    `INSERT INTO scenario_answers
     (session_id, scenario_id, user_event_id, user_reason, agent_event_id, agent_reason,
      user_decision, user_feedback, user_actions_json, agent_actions_json)
     VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    scenario.session_id,
    scenarioId,
    parsed.data.userReason,
    parsed.data.agentSummary,
    parsed.data.decision,
    parsed.data.feedback ?? null,
    JSON.stringify(userActions),
    JSON.stringify(parsed.data.agentActions),
  );

  db.prepare(
    "UPDATE sessions SET current_scenario_index = current_scenario_index + 1 WHERE id = ?",
  ).run(scenario.session_id);

  res.json({ ok: true, userActions });
});
