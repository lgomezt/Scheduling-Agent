import { upload } from "./client";

export type UploadKind = "survey" | "scenarios";

export const uploadPdf = (sessionId: string, kind: UploadKind, file: File) => {
  const fd = new FormData();
  fd.append("sessionId", sessionId);
  fd.append("kind", kind);
  fd.append("file", file);
  return upload<{ ok: true; kind: UploadKind; profileLength?: number; count?: number }>(
    "/api/uploads",
    fd,
  );
};
