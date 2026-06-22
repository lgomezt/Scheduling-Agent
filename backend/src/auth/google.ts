import { google } from "googleapis";
import { config } from "../config.js";

export const LOGIN_SCOPES = ["openid", "email", "profile"];

export const oauthClient = () =>
  new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);

export const authUrl = (state: string): string =>
  oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: LOGIN_SCOPES,
    state,
  });

export const exchangeCode = async (code: string) => {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  if (!data.id || !data.email) {
    throw new Error("Google login did not return a profile.");
  }

  return {
    sub: data.id,
    email: data.email,
    name: data.name ?? data.email,
  };
};
