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
    setMessage("Scheduling Agent is reading your calendar and the scenarios PDF…");
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
      subtitle="Upload the scenarios PDF. The agent uses the calendar you just set up to place each scenario's context events realistically."
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
                <ul className="scenario-summary-events muted">
                  {s.contextEvents.map((c, i) => (
                    <li key={i}>
                      <strong>{c.title}</strong>
                      {" — "}
                      {new Date(c.start).toLocaleString(undefined, {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {" → "}
                      {new Date(c.end).toLocaleString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </StepShell>
  );
};
