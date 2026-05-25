import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSession, getCurrentSession, getOnboardingState, confirmCalendar } from "../../api/sessions";
import { CalendarPane } from "../../components/calendar/CalendarPane";
import { StepShell } from "../../components/onboarding/StepShell";
import { mondayWeek } from "../../lib/week";
import { getCalendarStatus, putCalendarPrefs } from "../../api/google";

type Choice = "sync_titles" | "sync_anon" | "manual";

export const CalendarStep = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });
  const ensureSession = useMutation({
    mutationFn: createSession,
    onSuccess: (s) => qc.setQueryData(["session", "current"], s),
  });
  const triggered = useRef(false);
  useEffect(() => {
    if (!isLoading && !session && !triggered.current) {
      triggered.current = true;
      ensureSession.mutate();
    }
  }, [isLoading, session, ensureSession]);
  const sessionId = session?.id ?? "";

  const { data: onboarding } = useQuery({
    queryKey: ["onboarding", sessionId],
    queryFn: () => getOnboardingState(sessionId),
    enabled: !!sessionId,
  });

  const { data: calStatus } = useQuery({
    queryKey: ["google", "calendar-status"],
    queryFn: getCalendarStatus,
  });

  const initialChoice: Choice = calStatus?.syncEvents
    ? calStatus.syncTitles
      ? "sync_titles"
      : "sync_anon"
    : "manual";
  const [choice, setChoice] = useState<Choice>(initialChoice);
  const choiceSyncedRef = useRef(false);
  useEffect(() => {
    if (calStatus && !choiceSyncedRef.current) {
      choiceSyncedRef.current = true;
      setChoice(initialChoice);
    }
  }, [calStatus, initialChoice]);

  const savePrefs = useMutation({
    mutationFn: (vars: { syncEvents: boolean; syncTitles: boolean }) =>
      putCalendarPrefs(vars.syncEvents, vars.syncTitles),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google", "calendar-status"] }),
  });

  const confirmCal = useMutation({
    mutationFn: () => confirmCalendar(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      qc.invalidateQueries({ queryKey: ["onboarding", sessionId] });
    },
  });

  const today = useMemo(() => new Date(), []);
  const { start: weekStart } = mondayWeek(today);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const { start: visibleWeekStart } = mondayWeek(weekAnchor);

  if (!sessionId) return <div className="screen-center">Preparing your session…</div>;

  const handleContinue = async () => {
    const syncEvents = choice !== "manual";
    const syncTitles = choice === "sync_titles";
    await savePrefs.mutateAsync({ syncEvents, syncTitles });
    if (syncEvents && !calStatus?.connected) {
      window.location.href = "/api/auth/google/calendar/connect";
      return;
    }
    await confirmCal.mutateAsync();
    qc.invalidateQueries({ queryKey: ["events", sessionId] });
    navigate("/onboarding/profile");
  };

  const busy = savePrefs.isPending || confirmCal.isPending;

  return (
    <StepShell
      step="calendar"
      title="Set up your week"
      subtitle="This is the week you'll work through scenarios in. Tell us how to fill it."
      done={{
        calendar: !!onboarding?.calendarReady,
        profile: !!onboarding?.profileReady,
        scenarios: !!onboarding?.scenariosReady,
      }}
      footer={
        <div className="step-footer-row">
          <button onClick={handleContinue} disabled={busy}>
            {busy
              ? "Saving…"
              : choice !== "manual" && !calStatus?.connected
                ? "Save & connect Google →"
                : "Continue to profile →"}
          </button>
        </div>
      }
    >
      <fieldset className="calendar-pref calendar-pref-block">
        <legend>How should we populate your calendar?</legend>
        <label className="pref-radio">
          <input
            type="radio"
            name="calendar_choice"
            checked={choice === "sync_titles"}
            onChange={() => setChoice("sync_titles")}
          />
          <span>
            <strong>Bring my Google Calendar events with their titles.</strong> The agent sees real event names.
          </span>
        </label>
        <label className="pref-radio">
          <input
            type="radio"
            name="calendar_choice"
            checked={choice === "sync_anon"}
            onChange={() => setChoice("sync_anon")}
          />
          <span>
            <strong>Bring my events, but anonymize the titles as "Busy".</strong> Times come through; titles stay private.
          </span>
        </label>
        <label className="pref-radio">
          <input
            type="radio"
            name="calendar_choice"
            checked={choice === "manual"}
            onChange={() => setChoice("manual")}
          />
          <span>
            <strong>Start with an empty calendar.</strong> I'll add events manually below.
          </span>
        </label>
      </fieldset>

      <p className="muted onboarding-calendar-hint">
        You can click an empty slot to add an event right now. Whatever's on the calendar when you continue
        will be used as the starting point for the scenarios.
      </p>

      <div className="onboarding-calendar-host">
        <CalendarPane
          sessionId={sessionId}
          weekStart={visibleWeekStart}
          onWeekChange={setWeekAnchor}
          hideConnectButton
        />
      </div>
    </StepShell>
  );
};
