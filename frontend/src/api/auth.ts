import { api, ApiError } from "./client";

export type Me = { id: number; email: string; name: string };

export const fetchMe = async (): Promise<Me | null> => {
  try {
    return await api<Me>("/api/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
};

export const logout = () => api<{ ok: true }>("/api/auth/logout", { method: "POST" });
