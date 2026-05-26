import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getLatestSession, createSession } from "../api/sessions";

export const Done = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session, isLoading } = useQuery({
    queryKey: ["session", "latest"],
    queryFn: getLatestSession,
  });

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const startNew = useMutation({
    mutationFn: createSession,
    onSuccess: (s) => {
      qc.setQueryData(["session", "current"], s);
      qc.setQueryData(["session", "latest"], s);
      navigate("/onboarding/calendar");
    },
  });

  const handleDownload = async () => {
    if (!session) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      const res = await fetch(`/api/export/${session.id}`, { credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`Download failed (${res.status}): ${body || res.statusText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scheduling-agent-${session.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) return <div className="screen-center">Loading…</div>;

  return (
    <div className="screen done-screen">
      <h2>Session complete</h2>
      <p className="muted">
        Thanks for working through every scenario. Download your log to share with the researcher,
        then optionally start a new session.
      </p>
      <div className="done-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleDownload}
          disabled={!session || downloading}
        >
          {downloading ? "Preparing…" : "Download log (JSON)"}
        </button>
        <button
          className="btn-secondary"
          onClick={() => startNew.mutate()}
          disabled={startNew.isPending}
        >
          {startNew.isPending ? "Starting…" : "Start a new session"}
        </button>
      </div>
      {downloadError ? (
        <p className="muted" role="alert" style={{ color: "var(--danger)" }}>
          {downloadError}
        </p>
      ) : null}
    </div>
  );
};
