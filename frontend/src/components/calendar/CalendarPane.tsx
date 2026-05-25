import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, dateFnsLocalizer, type SlotInfo } from "react-big-calendar";
import withDragAndDrop, {
  type EventInteractionArgs,
} from "react-big-calendar/lib/addons/dragAndDrop";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parse, startOfWeek, getDay, addDays, addWeeks } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  createEvent,
  deleteEvent,
  getEvents,
  updateEventTime,
  updateEventTitle,
  type CalendarEvent,
} from "../../api/calendar";
import { getCalendarStatus } from "../../api/google";
import { CalendarConnectModal } from "./CalendarConnectModal";
import { styleFor } from "./eventStyles";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const locales = { "en-US": enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

type RBCEvent = {
  id: number;
  title: string;
  start: Date;
  end: Date;
  source: CalendarEvent["source"];
  metadata: CalendarEvent["metadata"];
};

const toRbc = (e: CalendarEvent): RBCEvent => ({
  id: e.id,
  title: e.title,
  start: new Date(e.start),
  end: new Date(e.end),
  source: e.source,
  metadata: e.metadata,
});

const DnDCalendar = withDragAndDrop<RBCEvent>(Calendar);

const isEditable = (_source: CalendarEvent["source"]) => true;

const asDate = (d: Date | string): Date => (typeof d === "string" ? new Date(d) : d);

const scrollToNineAm = new Date(2020, 0, 1, 9, 0, 0);

const DEFAULT_TITLE = "New event";

type Props = {
  sessionId: string;
  weekStart: Date;
  onWeekChange: (next: Date) => void;
  hideConnectButton?: boolean;
};

export const CalendarPane = ({
  sessionId,
  weekStart,
  onWeekChange,
  hideConnectButton = false,
}: Props) => {
  const qc = useQueryClient();
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const { data: events = [] } = useQuery({
    queryKey: ["events", sessionId, weekStart.toISOString()],
    queryFn: () => getEvents(sessionId, weekStart, weekEnd),
  });

  const { data: calStatus } = useQuery({
    queryKey: ["google", "calendar-status"],
    queryFn: getCalendarStatus,
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  const create = useMutation({
    mutationFn: (vars: { title: string; start: Date; end: Date }) =>
      createEvent(sessionId, vars.title, vars.start, vars.end),
    onSuccess: (ev) => {
      qc.invalidateQueries({ queryKey: ["events", sessionId] });
      setEditingId(ev.id);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteEvent(sessionId, id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["events", sessionId] });
      if (editingId === id) setEditingId(null);
    },
  });

  const updateTime = useMutation({
    mutationFn: (vars: { id: number; start: Date; end: Date }) =>
      updateEventTime(sessionId, vars.id, vars.start, vars.end),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", sessionId] }),
  });

  const updateTitle = useMutation({
    mutationFn: (vars: { id: number; title: string }) =>
      updateEventTitle(sessionId, vars.id, vars.title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", sessionId] }),
  });

  const rbcEvents = useMemo(() => events.map(toRbc), [events]);

  const handleMoveOrResize = ({ event, start, end }: EventInteractionArgs<RBCEvent>) => {
    if (!isEditable(event.source) || event.id < 0) return;
    updateTime.mutate({ id: event.id, start: asDate(start), end: asDate(end) });
  };

  const handleSelectSlot = (slot: SlotInfo) => {
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    if (end.getTime() - start.getTime() < 30 * 60 * 1000) {
      end.setTime(start.getTime() + 60 * 60 * 1000);
    }
    create.mutate({ title: DEFAULT_TITLE, start, end });
  };

  const commitTitle = (id: number, raw: string) => {
    const title = raw.trim();
    setEditingId(null);
    if (title.length === 0) {
      remove.mutate(id);
      return;
    }
    if (title === DEFAULT_TITLE) return;
    updateTitle.mutate({ id, title });
  };

  const EventContent = ({ event }: { event: RBCEvent }) => {
    const editing = editingId === event.id;
    const inputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [editing]);

    return (
      <div className="rbc-event-inner">
        {editing ? (
          <input
            ref={inputRef}
            className="rbc-event-title-input"
            defaultValue={event.title}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => commitTitle(event.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingId(null);
              }
            }}
          />
        ) : (
          <div
            className="rbc-event-title"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingId(event.id);
            }}
          >
            {event.title}
          </div>
        )}
        <button
          type="button"
          className="rbc-event-delete"
          title="Delete event"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            remove.mutate(event.id);
          }}
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <div className="calendar-pane">
      <div className="calendar-toolbar">
        <button onClick={() => onWeekChange(addWeeks(weekStart, -1))}>← Prev</button>
        <div className="week-label">
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </div>
        <button onClick={() => onWeekChange(addWeeks(weekStart, 1))}>Next →</button>
        <button onClick={() => onWeekChange(new Date())} className="btn-secondary">
          Today
        </button>
        {!hideConnectButton && calStatus ? (
          <button className="btn-secondary connect-cal" onClick={() => setShowConnect(true)}>
            {!calStatus.connected || !calStatus.syncEvents
              ? "Connect Google Calendar"
              : calStatus.syncTitles
                ? "Calendar synced ✎"
                : "Calendar synced (anonymized) ✎"}
          </button>
        ) : null}
      </div>
      {!hideConnectButton && showConnect && calStatus ? (
        <CalendarConnectModal status={calStatus} onClose={() => setShowConnect(false)} />
      ) : null}
      <div className="calendar-host">
        <DnDCalendar
          localizer={localizer}
          events={rbcEvents}
          defaultView="week"
          views={["week"]}
          date={weekStart}
          onNavigate={onWeekChange}
          toolbar={false}
          step={30}
          timeslots={2}
          scrollToTime={scrollToNineAm}
          selectable
          onSelectSlot={handleSelectSlot}
          eventPropGetter={(ev) => {
            const s = styleFor(ev.source);
            return {
              style: {
                backgroundColor: s.background,
                borderLeft: `3px solid ${s.border}`,
                color: s.foreground,
                borderRadius: 4,
              },
            };
          }}
          components={{ event: EventContent }}
          draggableAccessor={(ev) => isEditable(ev.source) && ev.id >= 0}
          resizableAccessor={(ev) => isEditable(ev.source) && ev.id >= 0}
          resizable
          onEventDrop={handleMoveOrResize}
          onEventResize={handleMoveOrResize}
        />
      </div>
    </div>
  );
};
