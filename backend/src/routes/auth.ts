import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  authUrl,
  exchangeCode,
  CALENDAR_SCOPE,
  LOGIN_SCOPES,
  hasCalendarScope,
} from "../auth/google.js";
import { requireAuth } from "../auth/session.js";
import { config } from "../config.js";

export const authRouter = Router();

const stateFor = (purpose: "login" | "calendar"): string =>
  `${purpose}:${crypto.randomBytes(16).toString("hex")}`;

const splitState = (state: string): { purpose: string; nonce: string } => {
  const idx = state.indexOf(":");
  if (idx < 0) return { purpose: "login", nonce: state };
  return { purpose: state.slice(0, idx), nonce: state.slice(idx + 1) };
};

authRouter.get("/google/login", (req, res) => {
  const state = stateFor("login");
  (req.session as { oauthState?: string } | null)!.oauthState = state;
  res.redirect(authUrl(state, LOGIN_SCOPES));
});

authRouter.get("/google/calendar/connect", requireAuth, (req, res) => {
  const state = stateFor("calendar");
  (req.session as { oauthState?: string } | null)!.oauthState = state;
  res.redirect(authUrl(state, [CALENDAR_SCOPE], { incremental: true }));
});

authRouter.get("/google/calendar/status", requireAuth, (req, res) => {
  const row = db
    .prepare(
      "SELECT scopes, sync_events, sync_titles FROM google_tokens WHERE user_id = ?",
    )
    .get(req.userId) as
    | { scopes: string | null; sync_events: number; sync_titles: number }
    | undefined;
  res.json({
    connected: hasCalendarScope(row?.scopes),
    syncEvents: !!row?.sync_events,
    syncTitles: row ? !!row.sync_titles : true,
  });
});

const prefsSchema = z.object({
  syncEvents: z.boolean(),
  syncTitles: z.boolean(),
});

authRouter.put("/google/calendar/prefs", requireAuth, (req, res) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = db
    .prepare("SELECT user_id FROM google_tokens WHERE user_id = ?")
    .get(req.userId) as { user_id: number } | undefined;
  if (existing) {
    db.prepare(
      "UPDATE google_tokens SET sync_events = ?, sync_titles = ? WHERE user_id = ?",
    ).run(parsed.data.syncEvents ? 1 : 0, parsed.data.syncTitles ? 1 : 0, req.userId);
  } else {
    db.prepare(
      `INSERT INTO google_tokens (user_id, access_token, sync_events, sync_titles)
       VALUES (?, '', ?, ?)`,
    ).run(req.userId, parsed.data.syncEvents ? 1 : 0, parsed.data.syncTitles ? 1 : 0);
  }
  res.json({ ok: true, syncEvents: parsed.data.syncEvents, syncTitles: parsed.data.syncTitles });
});

const mergeScopes = (existing: string | null, granted: string | null | undefined): string => {
  const set = new Set<string>();
  for (const s of (existing ?? "").split(/\s+/)) if (s) set.add(s);
  for (const s of (granted ?? "").split(/\s+/)) if (s) set.add(s);
  return [...set].join(" ");
};

authRouter.get("/google/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const sess = req.session as { oauthState?: string; userId?: number } | null;
  if (!code || !state || state !== sess?.oauthState) {
    res.status(400).send("Invalid OAuth state");
    return;
  }
  const { purpose } = splitState(state);

  try {
    const { profile, tokens } = await exchangeCode(code);

    if (purpose === "login") {
      if (!profile) {
        res.status(400).send("Google login did not return a profile.");
        return;
      }
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
      const prior = db
        .prepare("SELECT scopes FROM google_tokens WHERE user_id = ?")
        .get(userId) as { scopes: string | null } | undefined;
      db.prepare(
        `INSERT INTO google_tokens (user_id, access_token, refresh_token, expires_at, scopes)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
           expires_at = excluded.expires_at,
           scopes = excluded.scopes`,
      ).run(
        userId,
        tokens.access_token ?? "",
        tokens.refresh_token ?? null,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        mergeScopes(prior?.scopes ?? null, tokens.scope ?? null),
      );
      sess!.userId = userId;
      sess!.oauthState = undefined;
      res.redirect(config.publicUrl);
      return;
    }

    if (purpose === "calendar") {
      if (!sess?.userId) {
        res.status(401).send("Sign in first.");
        return;
      }
      const prior = db
        .prepare("SELECT scopes FROM google_tokens WHERE user_id = ?")
        .get(sess.userId) as { scopes: string | null } | undefined;
      db.prepare(
        `INSERT INTO google_tokens (user_id, access_token, refresh_token, expires_at, scopes)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
           expires_at = excluded.expires_at,
           scopes = excluded.scopes`,
      ).run(
        sess.userId,
        tokens.access_token ?? "",
        tokens.refresh_token ?? null,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        mergeScopes(prior?.scopes ?? null, tokens.scope ?? null),
      );
      sess.oauthState = undefined;
      res.redirect(config.publicUrl);
      return;
    }

    res.status(400).send("Unknown OAuth purpose");
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
