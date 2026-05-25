import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentSession, getOnboardingState } from "../../api/sessions";
import { uploadPdf } from "../../api/uploads";
import { getProfile, putProfile, resetProfile } from "../../api/profile";
import { StepShell } from "../../components/onboarding/StepShell";

export const ProfileStep = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: session } = useQuery({ queryKey: ["session", "current"], queryFn: getCurrentSession });
  const sessionId = session?.id ?? "";

  const { data: onboarding } = useQuery({
    queryKey: ["onboarding", sessionId],
    queryFn: () => getOnboardingState(sessionId),
    enabled: !!sessionId,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", sessionId],
    queryFn: () => getProfile(sessionId),
    enabled: !!sessionId,
  });

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const upload = async () => {
    if (!sessionId || !file) return;
    setStatus("uploading");
    setMessage("Sending to Gemini…");
    try {
      const r = await uploadPdf(sessionId, "survey", file);
      setStatus("done");
      setMessage(`Profile generated (${r.profileLength ?? 0} chars)`);
      qc.invalidateQueries({ queryKey: ["profile", sessionId] });
      qc.invalidateQueries({ queryKey: ["onboarding", sessionId] });
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  };

  const haveProfile = !!profile?.current;

  return (
    <StepShell
      step="profile"
      title="Tell us about you"
      subtitle="Upload your survey PDF. Gemini turns it into a markdown profile the agent reads."
      done={{
        calendar: !!onboarding?.calendarReady,
        profile: !!onboarding?.profileReady,
        scenarios: !!onboarding?.scenariosReady,
      }}
      footer={
        <div className="step-footer-row">
          <button className="btn-secondary" onClick={() => navigate("/onboarding/calendar")}>
            ← Back
          </button>
          <button onClick={() => navigate("/onboarding/scenarios")} disabled={!haveProfile}>
            Continue to scenarios →
          </button>
        </div>
      }
    >
      <div className={`upload-slot status-${status}`}>
        <div className="upload-slot-label">Survey PDF</div>
        <div className="upload-slot-hint">
          {haveProfile
            ? "A profile already exists. Upload a new PDF to regenerate it."
            : "Your answers from the Google Forms preferences survey."}
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
            {status === "uploading" ? "Processing…" : haveProfile ? "Replace profile" : "Generate profile"}
          </button>
        </div>
      </div>

      {haveProfile && profile ? (
        <ProfileEditor sessionId={sessionId} profile={profile} />
      ) : null}
    </StepShell>
  );
};

type ProfileEditorProps = {
  sessionId: string;
  profile: { initial: string | null; current: string | null; edited: boolean };
};

const ProfileEditor = ({ sessionId, profile }: ProfileEditorProps) => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"edit" | "original">("edit");
  const [draft, setDraft] = useState(profile.current ?? "");
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: (md: string) => putProfile(sessionId, md),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["profile", sessionId] });
    },
  });
  const reset = useMutation({
    mutationFn: () => resetProfile(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", sessionId] });
    },
  });

  const showEdited = profile.edited || dirty;

  return (
    <div className="profile-editor">
      <div className="profile-editor-header">
        <h3>Profile</h3>
        {showEdited ? <span className="tag tag-edited">edited</span> : null}
      </div>
      <p className="muted profile-editor-hint">
        Read it through. Edit anything that's wrong or incomplete — the agent will use whatever you save here.
        The original version stays in the research log.
      </p>
      <div className="profile-tabs">
        <button
          className={tab === "edit" ? "profile-tab active" : "profile-tab"}
          onClick={() => setTab("edit")}
        >
          Edit (current)
        </button>
        <button
          className={tab === "original" ? "profile-tab active" : "profile-tab"}
          onClick={() => setTab("original")}
        >
          Original
        </button>
      </div>
      {tab === "edit" ? (
        <>
          <textarea
            className="profile-textarea"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(e.target.value !== profile.current);
            }}
            rows={20}
          />
          <div className="profile-editor-actions">
            <span className="muted profile-char-count">{draft.length} chars</span>
            <button
              className="btn-secondary"
              onClick={() => {
                if (confirm("Discard edits and reset to original?")) reset.mutate();
              }}
              disabled={reset.isPending}
            >
              Reset to original
            </button>
            <button onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </>
      ) : (
        <pre className="profile-original">{profile.initial ?? "(no original captured)"}</pre>
      )}
    </div>
  );
};
