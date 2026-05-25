import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { putCalendarPrefs, type CalendarStatus } from "../../api/google";

type Props = {
  status: CalendarStatus;
  onClose: () => void;
};

export const CalendarConnectModal = ({ status, onClose }: Props) => {
  const qc = useQueryClient();
  const [syncEvents, setSyncEvents] = useState(status.syncEvents);
  const [syncTitles, setSyncTitles] = useState(status.syncTitles);

  const save = useMutation({
    mutationFn: (vars: { syncEvents: boolean; syncTitles: boolean }) =>
      putCalendarPrefs(vars.syncEvents, vars.syncTitles),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google", "calendar-status"] }),
  });

  const onConfirm = async () => {
    await save.mutateAsync({ syncEvents, syncTitles });
    if (syncEvents && !status.connected) {
      window.location.href = "/api/auth/google/calendar/connect";
      return;
    }
    qc.invalidateQueries({ queryKey: ["events"] });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal calendar-connect-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Google Calendar</h3>
        <p className="muted">
          Choose what to bring from your Google Calendar. You can change these any time.
        </p>

        <fieldset className="calendar-pref">
          <legend>Bring your events into this study?</legend>
          <label className="pref-radio">
            <input
              type="radio"
              name="sync_events"
              checked={syncEvents}
              onChange={() => setSyncEvents(true)}
            />
            <span>
              <strong>Yes</strong> — show my Google events on the study calendar.
            </span>
          </label>
          <label className="pref-radio">
            <input
              type="radio"
              name="sync_events"
              checked={!syncEvents}
              onChange={() => setSyncEvents(false)}
            />
            <span>
              <strong>No</strong> — start from an empty calendar.
            </span>
          </label>
        </fieldset>

        {syncEvents ? (
          <fieldset className="calendar-pref">
            <legend>Show event titles?</legend>
            <label className="pref-radio">
              <input
                type="radio"
                name="sync_titles"
                checked={syncTitles}
                onChange={() => setSyncTitles(true)}
              />
              <span>
                <strong>Show titles</strong> — the agent sees real event names too.
              </span>
            </label>
            <label className="pref-radio">
              <input
                type="radio"
                name="sync_titles"
                checked={!syncTitles}
                onChange={() => setSyncTitles(false)}
              />
              <span>
                <strong>Anonymize as "Busy"</strong> — only times come through; titles stay private.
              </span>
            </label>
          </fieldset>
        ) : null}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={save.isPending}>
            {save.isPending
              ? "Saving…"
              : syncEvents && !status.connected
                ? "Save & connect Google"
                : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};
