import { api } from "./client";

export type ProfileResponse = {
  initial: string | null;
  current: string | null;
  edited: boolean;
};

export const getProfile = (sessionId: string) => api<ProfileResponse>(`/api/profile/${sessionId}`);

export const putProfile = (sessionId: string, markdown: string) =>
  api<{ ok: true; length: number }>(`/api/profile/${sessionId}`, {
    method: "PUT",
    body: JSON.stringify({ markdown }),
  });

export const resetProfile = (sessionId: string) =>
  api<{ ok: true }>(`/api/profile/${sessionId}/reset`, { method: "POST" });
