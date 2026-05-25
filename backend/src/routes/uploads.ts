import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { config } from "../config.js";
import { pdfToProfile, pdfToScenarios } from "../services/gemini.js";
import { listGoogleEvents } from "../services/google-calendar.js";

export const uploadsRouter = Router();

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sessionId = (req.body?.sessionId ?? req.query?.sessionId) as string | undefined;
    if (!sessionId) return cb(new Error("sessionId required"), "");
    const dir = path.join(config.dataDir, "uploads", sessionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

const sessionForUser = (sessionId: string, userId: number) =>
  db
    .prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as { id: string } | undefined;

uploadsRouter.post("/", requireAuth, upload.single("file"), async (req, res) => {
  const file = req.file;
  const { sessionId, kind } = req.body as { sessionId?: string; kind?: string };

  if (!file || !sessionId || !kind || (kind !== "survey" && kind !== "scenarios")) {
    if (file?.path) fs.unlinkSync(file.path);
    res.status(400).json({ error: "Missing file, sessionId, or kind (survey|scenarios)" });
    return;
  }
  if (!sessionForUser(sessionId, req.userId!)) {
    fs.unlinkSync(file.path);
    res.status(404).json({ error: "Session not found" });
    return;
  }

  db.prepare(
    "INSERT INTO uploads (session_id, kind, original_filename, path) VALUES (?, ?, ?, ?)",
  ).run(sessionId, kind, file.originalname, file.path);

  try {
    if (kind === "survey") {
      const markdown = await pdfToProfile(file.path);
      const dir = path.join(config.dataDir, "profiles");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${sessionId}.initial.md`), markdown, "utf8");
      fs.writeFileSync(path.join(dir, `${sessionId}.current.md`), markdown, "utf8");
      res.json({ kind, ok: true, profileLength: markdown.length });
      return;
    }

    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const mondayLocal = new Date(now);
    mondayLocal.setDate(now.getDate() - dow);
    mondayLocal.setHours(0, 0, 0, 0);
    const sundayLocal = new Date(mondayLocal);
    sundayLocal.setDate(mondayLocal.getDate() + 6);
    sundayLocal.setHours(23, 59, 59, 999);

    const weekRowsRaw = db
      .prepare(
        `SELECT title, start_iso AS start, end_iso AS end FROM calendar_events
         WHERE session_id = ? AND start_iso < ? AND end_iso > ?
         ORDER BY start_iso`,
      )
      .all(sessionId, sundayLocal.toISOString(), mondayLocal.toISOString()) as Array<{
      title: string;
      start: string;
      end: string;
    }>;
    let weekRows = weekRowsRaw;
    try {
      const googleNow = await listGoogleEvents(req.userId!, mondayLocal.toISOString(), sundayLocal.toISOString());
      weekRows = [
        ...weekRows,
        ...googleNow.map((g) => ({ title: g.title, start: g.startIso, end: g.endIso })),
      ];
    } catch (err) {
      console.warn("Google fetch for scenario gen failed:", (err as Error).message);
    }
    const offsetMin = -now.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    const tzHint = `${sign}${hh}:${mm}`;

    const scenarios = await pdfToScenarios(file.path, {
      currentWeek: {
        mondayIso: mondayLocal.toISOString(),
        sundayIso: sundayLocal.toISOString(),
        timezoneHint: `UTC${tzHint}`,
      },
      existingEvents: weekRows,
    });
    const insert = db.prepare(
      `INSERT INTO scenarios
       (session_id, order_index, title, description, options_json, context_events_json, prompt_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    db.prepare("DELETE FROM scenarios WHERE session_id = ?").run(sessionId);
    const tx = db.transaction((items: typeof scenarios) => {
      items.forEach((s, i) => {
        const options = s.options
          ? s.options.map((o, idx) => ({
              id: `opt_${idx}`,
              label: o.label,
              suggestedStart: o.suggested_start,
              suggestedEnd: o.suggested_end,
            }))
          : null;
        const contextEvents = (s.context_events ?? []).map((e) => ({
          title: e.title,
          start: e.start,
          end: e.end,
        }));
        insert.run(
          sessionId,
          i,
          s.title,
          s.description,
          options ? JSON.stringify(options) : null,
          contextEvents.length ? JSON.stringify(contextEvents) : null,
          s.prompt_summary ?? null,
        );
      });
    });
    tx(scenarios);
    res.json({ kind, ok: true, count: scenarios.length });
  } catch (err) {
    console.error(`Upload processing failed (${kind}):`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});
