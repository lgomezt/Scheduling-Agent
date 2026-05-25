import express from "express";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import "./db/client.js";
import { sessionMiddleware, attachUser } from "./auth/session.js";
import { authRouter } from "./routes/auth.js";
import { sessionsRouter } from "./routes/sessions.js";
import { uploadsRouter } from "./routes/uploads.js";
import { profileRouter } from "./routes/profile.js";
import { scenariosRouter } from "./routes/scenarios.js";
import { calendarRouter } from "./routes/calendar.js";
import { agentRouter } from "./routes/agent.js";
import { exportRouter } from "./routes/export.js";

const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "5mb" }));
app.use(sessionMiddleware());
app.use(attachUser);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/scenarios", scenariosRouter);
app.use("/api/events", calendarRouter);
app.use("/api/agent", agentRouter);
app.use("/api/export", exportRouter);

const publicDir = path.resolve(process.env.PUBLIC_DIR ?? "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
