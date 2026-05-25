import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSession, getCurrentSession } from "../api/sessions";
import { uploadPdf, type UploadKind } from "../api/uploads";
import { getScenarios } from "../api/scenarios";
import { getProfile, putProfile, resetProfile } from "../api/profile";

type FileStatus = "idle" | "uploading" | "done" | "error";

type SlotState = {
  file: File | null;
  status: FileStatus;
  message: string;
};

const emptySlot = (): SlotState => ({ file: null, status: "idle", message: "" });

export const Upload = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: existing, isLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });
  const ensureSession = useMutation({
    mutationFn: createSession,
    onSuccess: (s) => qc.setQueryData(["session", "current"], s),
  });
  const triggered = useRef(false);
  useEffect(() => {
    if (!isLoading && !existing && !triggered.current) {
      triggered.current = true;
      ensureSession.mutate();
    }
  }, [isLoading, existing, ensureSession]);

  const sessionId = existing?.id;

  const { data: profile } = useQuery({
    queryKey: ["profile", sessionId],
    queryFn: () => getProfile(sessionId!),
    enabled: !!sessionId,
  });
  const { data: scenarios } = useQuery({
    queryKey: ["scenarios", sessionId],
    queryFn: () => getScenarios(sessionId!),
    enabled: !!sessionId,
  });

  const [survey, setSurvey] = useState<SlotState>(emptySlot());
  const [scenariosSlot, setScenariosSlot] = useState<SlotState>(emptySlot());

  const runUpload = async (kind: UploadKind, slot: SlotState, setSlot: (s: SlotState) => void) => {
    if (!sessionId || !slot.file) return;
    setSlot({ ...slot, status: "uploading", message: "Sending to Gemini…" });
    try {
      const r = await uploadPdf(sessionId, kind, slot.file);
      const detail =
        kind === "survey"
          ? `Profile generated (${r.profileLength ?? 0} chars)`
          : `${r.count ?? 0} scenarios extracted`;
      setSlot({ ...slot, status: "done", message: detail });
      if (kind === "survey") qc.invalidateQueries({ queryKey: ["profile", sessionId] });
      else qc.invalidateQueries({ queryKey: ["scenarios", sessionId] });
    } catch (e) {
      setSlot({ ...slot, status: "error", message: (e as Error).message });
    }
  };

  const anyToProcess =
    !!sessionId &&
    (survey.file || scenariosSlot.file) &&
    survey.status !== "uploading" &&
    scenariosSlot.status !== "uploading";

  const submit = () => {
    if (survey.file) runUpload("survey", survey, setSurvey);
    if (scenariosSlot.file) runUpload("scenarios", scenariosSlot, setScenariosSlot);
  };

  if (isLoading || !sessionId) {
    return <div className="screen-center">Preparing your session…</div>;
  }

  const haveProfile = !!profile?.current;
  const scenarioCount = scenarios?.length ?? 0;
  const haveAny = haveProfile || scenarioCount > 0;

  return (
    <div className="screen upload-screen">
      <h2>Upload material</h2>
      <p className="muted">
        Upload your survey answers and a scenarios PDF. Re-uploading replaces what's already there for this session.
      </p>

      {haveAny ? (
        <div className="upload-existing">
          <div className="upload-existing-row">
            <span className="upload-existing-label">Survey profile</span>
            <span className={haveProfile ? "tag tag-ok" : "tag tag-empty"}>
              {haveProfile ? "uploaded" : "not yet"}
            </span>
          </div>
          <div className="upload-existing-row">
            <span className="upload-existing-label">Scenarios</span>
            <span className={scenarioCount > 0 ? "tag tag-ok" : "tag tag-empty"}>
              {scenarioCount > 0 ? `${scenarioCount} loaded` : "not yet"}
            </span>
          </div>
        </div>
      ) : null}

      <div className="upload-grid">
        <UploadSlot
          label="Survey PDF"
          hint={
            haveProfile
              ? "A profile already exists. Pick a new PDF to overwrite it."
              : "Your answers from the Google Forms preferences survey."
          }
          slot={survey}
          onPick={(file) => setSurvey({ ...emptySlot(), file })}
        />
        <UploadSlot
          label="Scenarios PDF"
          hint={
            scenarioCount > 0
              ? `${scenarioCount} scenarios already loaded. Pick a new PDF to replace them.`
              : "A document listing the scheduling scenarios for this session."
          }
          slot={scenariosSlot}
          onPick={(file) => setScenariosSlot({ ...emptySlot(), file })}
        />
      </div>

      <div className="upload-actions">
        <button onClick={submit} disabled={!anyToProcess}>
          Process selected
        </button>
        <button
          className="btn-secondary"
          onClick={() => navigate("/workspace")}
          disabled={!haveAny && survey.status !== "done" && scenariosSlot.status !== "done"}
        >
          {haveAny ? "Back to workspace →" : "Continue →"}
        </button>
      </div>

      {haveProfile && profile ? <ProfileEditor sessionId={sessionId} profile={profile} /> : null}
    </div>
  );
};

type ProfileEditorProps = {
  sessionId: string;
  profile: { initial: string | null; current: string | null; edited: boolean };
};

const ProfileEditor = ({ sessionId, profile }: ProfileEditorProps) => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"edit" | "original">("edit");
  const [draft, setDraft] = useState<string>(profile.current ?? "");
  const [dirty, setDirty] = useState(false);
  const lastSyncedRef = useRef<string | null>(profile.current);

  useEffect(() => {
    if (profile.current !== lastSyncedRef.current) {
      lastSyncedRef.current = profile.current;
      setDraft(profile.current ?? "");
      setDirty(false);
    }
  }, [profile.current]);

  const save = useMutation({
    mutationFn: (md: string) => putProfile(sessionId, md),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["profile", sessionId] });
    },
  });

  const reset = useMutation({
    mutationFn: () => resetProfile(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", sessionId] }),
  });

  const showEdited = profile.edited || dirty;

  return (
    <div className="profile-editor">
      <div className="profile-editor-header">
        <h3>Profile</h3>
        {showEdited ? <span className="tag tag-edited">edited</span> : null}
      </div>
      <p className="muted profile-editor-hint">
        This is the markdown the agent reads when proposing answers. Edit freely and Save — the original
        version is preserved for the research log.
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
            rows={18}
          />
          <div className="profile-editor-actions">
            <span className="muted profile-char-count">{draft.length} chars</span>
            <button
              className="btn-secondary"
              onClick={() => {
                if (confirm("Discard your edits and reset to the original profile?")) {
                  reset.mutate();
                }
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

const UploadSlot = ({
  label,
  hint,
  slot,
  onPick,
}: {
  label: string;
  hint: string;
  slot: SlotState;
  onPick: (file: File) => void;
}) => (
  <div className={`upload-slot status-${slot.status}`}>
    <div className="upload-slot-label">{label}</div>
    <div className="upload-slot-hint">{hint}</div>
    <label className="upload-slot-picker">
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
        disabled={slot.status === "uploading"}
      />
      <span>{slot.file ? slot.file.name : "Choose a PDF"}</span>
    </label>
    {slot.message ? <div className="upload-slot-status">{slot.message}</div> : null}
  </div>
);
