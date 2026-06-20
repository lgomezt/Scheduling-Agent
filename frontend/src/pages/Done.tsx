import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
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
      navigate("/onboarding");
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
      a.download = `scheduling-study-${session.id}.json`;
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
    <div className="study-screen">
      <div className="study-card done-screen">
        <div className="step-label">STEP 5 OF 5 · COMPLETE</div>
        <h1>Session complete</h1>
        <p className="study-subtitle">
          Download the study log to share with the researcher.
        </p>
        <div className="done-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleDownload}
          disabled={!session || downloading}
        >
          {downloading ? "Preparing..." : <><Download size={16} /> Download log (JSON)</>}
        </button>
        <button
          className="btn-secondary"
          onClick={() => startNew.mutate()}
          disabled={startNew.isPending}
        >
          {startNew.isPending ? "Starting..." : "Start a new session"}
        </button>
        </div>
        {downloadError ? (
          <p className="form-error" role="alert">
            {downloadError}
          </p>
        ) : null}
      </div>
    </div>
  );
};
