import "dotenv/config";
import path from "node:path";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
};

const optional = (name: string, fallback: string): string => process.env[name] ?? fallback;

export const config = {
  port: Number(optional("PORT", "3001")),
  publicUrl: optional("PUBLIC_URL", "http://localhost:5174"),
  dataDir: path.resolve(optional("DATA_DIR", "./data")),
  sessionSecret: optional("SESSION_SECRET", "dev-secret-change-me"),

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: optional("GEMINI_MODEL", "gemini-2.0-flash-exp"),
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: optional("GOOGLE_REDIRECT_URI", "http://localhost:5174/api/auth/google/callback"),
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
  },

  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    redirectUri: optional("MICROSOFT_REDIRECT_URI", "http://localhost:5174/api/auth/microsoft/callback"),
    tenant: optional("MICROSOFT_TENANT", "common"),
    scopes: ["offline_access", "User.Read", "Calendars.Read"],
  },
};

export { required };
