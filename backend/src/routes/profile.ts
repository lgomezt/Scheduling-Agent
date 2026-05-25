import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../auth/session.js";
import { config } from "../config.js";

export const profileRouter = Router();

const sessionOwnedBy = (sessionId: string, userId: number) =>
  db
    .prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId) as { id: string } | undefined;

const profilePaths = (sessionId: string) => {
  const dir = path.join(config.dataDir, "profiles");
  return {
    dir,
    initial: path.join(dir, `${sessionId}.initial.md`),
    current: path.join(dir, `${sessionId}.current.md`),
    legacy: path.join(dir, `${sessionId}.md`),
  };
};

const readIfExists = (p: string): string | null =>
  fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;

profileRouter.get("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  if (!sessionOwnedBy(sessionId, req.userId!)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const { initial, current, legacy } = profilePaths(sessionId);
  // Back-compat: if no initial/current yet but legacy .md exists, lift legacy into both.
  if (!fs.existsSync(initial) && fs.existsSync(legacy)) {
    const md = fs.readFileSync(legacy, "utf8");
    fs.writeFileSync(initial, md, "utf8");
    if (!fs.existsSync(current)) fs.writeFileSync(current, md, "utf8");
  }
  const initialMd = readIfExists(initial);
  const currentMd = readIfExists(current) ?? initialMd;
  const edited = !!initialMd && !!currentMd && initialMd !== currentMd;
  res.json({
    initial: initialMd,
    current: currentMd,
    edited,
  });
});

const putSchema = z.object({ markdown: z.string() });

profileRouter.put("/:sessionId", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  if (!sessionOwnedBy(sessionId, req.userId!)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { dir, current, initial } = profilePaths(sessionId);
  if (!fs.existsSync(initial)) {
    res.status(400).json({ error: "Profile has not been generated yet" });
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(current, parsed.data.markdown, "utf8");
  res.json({ ok: true, length: parsed.data.markdown.length });
});

profileRouter.post("/:sessionId/reset", requireAuth, (req, res) => {
  const sessionId = String(req.params.sessionId);
  if (!sessionOwnedBy(sessionId, req.userId!)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const { initial, current } = profilePaths(sessionId);
  if (!fs.existsSync(initial)) {
    res.status(404).json({ error: "No initial profile to reset to" });
    return;
  }
  fs.copyFileSync(initial, current);
  res.json({ ok: true });
});
