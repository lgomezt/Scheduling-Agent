import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/client.js";
import { authUrl, exchangeCode } from "../auth/google.js";
import { requireAuth } from "../auth/session.js";
import { config } from "../config.js";

export const authRouter = Router();

authRouter.get("/google/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  (req.session as { oauthState?: string } | null)!.oauthState = state;
  res.redirect(authUrl(state));
});

authRouter.get("/google/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const sess = req.session as { oauthState?: string; userId?: number } | null;
  if (!code || !state || state !== sess?.oauthState) {
    res.status(400).send("Invalid OAuth state");
    return;
  }

  try {
    const profile = await exchangeCode(code);
    const existing = db
      .prepare("SELECT id FROM users WHERE google_sub = ?")
      .get(profile.sub) as { id: number } | undefined;
    let userId: number;

    if (existing) {
      userId = existing.id;
      db.prepare("UPDATE users SET email = ?, name = ? WHERE id = ?").run(
        profile.email,
        profile.name,
        userId,
      );
    } else {
      const result = db
        .prepare("INSERT INTO users (google_sub, email, name) VALUES (?, ?, ?)")
        .run(profile.sub, profile.email, profile.name);
      userId = Number(result.lastInsertRowid);
    }

    sess!.userId = userId;
    sess!.oauthState = undefined;
    res.redirect(config.publicUrl);
  } catch (err) {
    console.error("OAuth callback failed", err);
    res.status(500).send("OAuth failed");
  }
});

authRouter.post("/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = db
    .prepare("SELECT id, email, name FROM users WHERE id = ?")
    .get(req.userId) as { id: number; email: string; name: string } | undefined;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});
