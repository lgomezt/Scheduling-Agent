import type { Request, Response, NextFunction, RequestHandler } from "express";
import cookieSession from "cookie-session";
import { config } from "../config.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: number;
  }
}

export const sessionMiddleware = (): RequestHandler =>
  cookieSession({
    name: "sa.sid",
    keys: [config.sessionSecret],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
  });

export const attachUser = (req: Request, _res: Response, next: NextFunction): void => {
  const userId = (req.session as { userId?: number } | null)?.userId;
  if (typeof userId === "number") req.userId = userId;
  next();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
};
