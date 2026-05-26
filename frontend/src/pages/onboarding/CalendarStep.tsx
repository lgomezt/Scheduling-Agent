import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSession, getCurrentSession, getOnboardingState, confirmCalendar } from "../../api/sessions";
import { CalendarPane } from "../../components/calendar/CalendarPane";
import { StepShell } from "../../components/onboarding/StepShell";
import { mondayWeek } from "../../lib/week";
import { getCalendarStatus, putCalendarPrefs } from "../../api/google";
import { getEvents } from "../../api/calendar";

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google", "calendar-status"] });
      qc.invalidateQueries({ queryKey: ["events", sessionId] });
    },
  });

  const handleChoiceChange = async (next: Choice) => {
    setChoice(next);
    if (!sessionId) return;
    const syncEvents = next !== "manual";
    const syncTitles = next === "sync_titles";
    // Persist the pref so the next events GET respects sync state. We
    // intentionally do NOT delete any events here — toggling between options
    // must be non-destructive so users can preview each mode and switch back.
    // The display-side `allowedSources` filter hides Google events when manual
    // is selected; the cached data stays so toggling back is instant.
    await savePrefs.mutateAsync({ syncEvents, syncTitles });
    qc.invalidateQueries({ queryKey: ["events", sessionId] });
  };

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

  // In sync modes pull a ~6-week window (1 week before, 4 weeks after) so
  // the participant sees the surrounding month and Prev/Next is instant.
  const prefetchRange = useMemo(() => {
    if (choice === "manual") return undefined;
    const start = new Date(visibleWeekStart);
    start.setDate(start.getDate() - 7);
    const end = new Date(visibleWeekStart);
    end.setDate(end.getDate() + 28);
    return { start, end };
  }, [choice, visibleWeekStart]);

  const queryStart = prefetchRange?.start ?? visibleWeekStart;
  const queryEnd = useMemo(() => {
    if (prefetchRange) return prefetchRange.end;
    const d = new Date(visibleWeekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [prefetchRange, visibleWeekStart]);

  const { data: visibleEvents = [] } = useQuery({
    queryKey: ["events", sessionId, queryStart.toISOString(), queryEnd.toISOString()],
    queryFn: () => getEvents(sessionId, queryStart, queryEnd),
    enabled: !!sessionId,
  });

  // After OAuth returns, calStatus.connected flips false → true. Force a
  // refetch of events so the just-granted Google scope actually populates
  // the calendar without a manual reload.
  const wasConnectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const now = !!calStatus?.connected;
    if (wasConnectedRef.current === false && now) {
      qc.invalidateQueries({ queryKey: ["events", sessionId] });
      qc.invalidateQueries({ queryKey: ["google", "calendar-status"] });
    }
    wasConnectedRef.current = now;
  }, [calStatus?.connected, qc, sessionId]);

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
  const manualEventCount = visibleEvents.filter((e) => e.source === "manual").length;
  const manualBlocked = choice === "manual" && manualEventCount === 0;
  const continueDisabled = busy || manualBlocked;
  const allowedSources: ("manual" | "google")[] =
    choice === "manual" ? ["manual"] : ["manual", "google"];

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
          {manualBlocked ? (
            <span className="muted manual-blocked-hint">
              Add at least one event to your calendar before continuing.
            </span>
          ) : null}
          <button onClick={handleContinue} disabled={continueDisabled}>
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
            onChange={() => handleChoiceChange("sync_titles")}
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
            onChange={() => handleChoiceChange("sync_anon")}
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
            onChange={() => handleChoiceChange("manual")}
          />
          <span>
            <strong>Start with an empty calendar.</strong> I'll add events manually below.
          </span>
        </label>
      </fieldset>

      {choice === "manual" ? (
        <p className="muted onboarding-calendar-hint">
          Click an empty slot to add an event. Whatever's on the calendar when you continue will be the
          starting point for the scenarios.
        </p>
      ) : (
        <div className="calendar-sync-note muted">
          {calStatus?.connected ? (
            <>
              Your Google Calendar is connected. Events for the previous week, this week, and the rest
              of the month are shown below
              {choice === "sync_anon" ? " with titles anonymized as \"Busy\"" : ""}. Use Prev / Next to
              browse.
            </>
          ) : (
            <>
              We'll connect your Google Calendar when you continue. After that, the agent will see your
              real schedule
              {choice === "sync_anon" ? " (with titles anonymized as \"Busy\")" : ""}.
            </>
          )}
        </div>
      )}

      <div className="onboarding-calendar-host">
        <CalendarPane
          sessionId={sessionId}
          weekStart={visibleWeekStart}
          onWeekChange={setWeekAnchor}
          hideConnectButton
          allowedSources={allowedSources}
          prefetchRange={prefetchRange}
        />
      </div>
    </StepShell>
  );
};
