import { addWeeks, endOfWeek, startOfWeek } from "date-fns";

export const mondayWeek = (date: Date): { start: Date; end: Date } => ({
  start: startOfWeek(date, { weekStartsOn: 1 }),
  end: endOfWeek(date, { weekStartsOn: 1 }),
});

export const stepWeek = (date: Date, dir: -1 | 1): Date => addWeeks(date, dir);
