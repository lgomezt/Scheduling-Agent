import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentSession, getOnboardingState } from "../../api/sessions";
import { uploadPdf } from "../../api/uploads";
import { getScenarios } from "../../api/scenarios";
import { StepShell } from "../../components/onboarding/StepShell";

export const ScenariosStep = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: session } = useQuery({ queryKey: ["session", "current"], queryFn: getCurrentSession });
  const sessionId = session?.id ?? "";

  const { data: onboarding } = useQuery({
    queryKey: ["onboarding", sessionId],
    queryFn: () => getOnboardingState(sessionId),
    enabled: !!sessionId,
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ["scenarios", sessionId],
    queryFn: () => getScenarios(sessionId),
    enabled: !!sessionId,
  });

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const upload = async () => {
    if (!sessionId || !file) return;
    setStatus("uploading");
    setMessage("Gemini is reading your calendar and the scenarios PDF…");
    try {
      const r = await uploadPdf(sessionId, "scenarios", file);
      setStatus("done");
      setMessage(`${r.count ?? 0} scenarios extracted`);
      qc.invalidateQueries({ queryKey: ["scenarios", sessionId] });
      qc.invalidateQueries({ queryKey: ["onboarding", sessionId] });
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  };

  const haveScenarios = scenarios.length > 0;

  return (
    <StepShell
      step="scenarios"
      title="Add the scenarios"
      subtitle="Upload the scenarios PDF. Gemini sees the calendar you just set up so it can place each scenario's context events realistically."
      done={{
        calendar: !!onboarding?.calendarReady,
        profile: !!onboarding?.profileReady,
        scenarios: !!onboarding?.scenariosReady,
      }}
      footer={
        <div className="step-footer-row">
          <button className="btn-secondary" onClick={() => navigate("/onboarding/profile")}>
            ← Back
          </button>
          <button onClick={() => navigate("/workspace")} disabled={!haveScenarios}>
            Enter workspace →
          </button>
        </div>
      }
    >
      <div className={`upload-slot status-${status}`}>
        <div className="upload-slot-label">Scenarios PDF</div>
        <div className="upload-slot-hint">
          {haveScenarios
            ? `${scenarios.length} scenarios already loaded. Upload a new PDF to replace them.`
            : "A document listing the scheduling scenarios for this session."}
        </div>
        <label className="upload-slot-picker">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={status === "uploading"}
          />
          <span>{file ? file.name : "Choose a PDF"}</span>
        </label>
        {message ? <div className="upload-slot-status">{message}</div> : null}
        <div className="upload-slot-actions">
          <button onClick={upload} disabled={!file || status === "uploading"}>
            {status === "uploading"
              ? "Processing…"
              : haveScenarios
                ? "Replace scenarios"
                : "Extract scenarios"}
          </button>
        </div>
      </div>

      {haveScenarios ? (
        <ol className="scenario-summary-list">
          {scenarios.map((s) => (
            <li key={s.id}>
              <div className="scenario-summary-title">{s.title}</div>
              {s.promptSummary ? (
                <div className="scenario-summary-prompt muted">{s.promptSummary}</div>
              ) : null}
              {s.contextEvents && s.contextEvents.length > 0 ? (
                <div className="muted scenario-summary-meta">
                  {s.contextEvents.length} context event{s.contextEvents.length === 1 ? "" : "s"}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </StepShell>
  );
};
