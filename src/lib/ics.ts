import ical, { type ParameterValue, type VEvent } from "node-ical";
import { type Day, dayFromLocalParts, dayInZone } from "./dates";

export type IcsEvent = {
  uid: string;
  title: string;
  /** The day of DTSTART. For a repeating event, that's its first date. */
  gigDate: Day;
  created: Date | null;
  lastModified: Date | null;
  hasRRule: boolean;
};

function text(value: ParameterValue | undefined): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : value.val;
}

function validDate(value: Date | undefined): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? new Date(value.getTime()) : null;
}

/**
 * Parses one calendar object's iCalendar text into its events.
 * Timed (not all-day) events use the day they start on in `timeZone`.
 * Throws if the text can't be parsed or an event has no UID or start date.
 */
export function parseIcs(icsText: string, timeZone: string): IcsEvent[] {
  const components = Object.values(ical.sync.parseICS(icsText));
  const events: IcsEvent[] = [];

  for (const component of components) {
    if (component?.type !== "VEVENT") continue;
    const event = component as VEvent;
    // Edits to a single occurrence of a repeating event. The base event covers them.
    if (event.recurrenceid) continue;

    if (!event.uid) throw new Error("An event has no UID");
    const start = validDate(event.start);
    if (!start) throw new Error(`Event ${event.uid} has no start date`);

    events.push({
      uid: event.uid,
      title: text(event.summary).trim(),
      // node-ical gives all-day dates as local midnight on the server.
      gigDate: event.start.dateOnly ? dayFromLocalParts(start) : dayInZone(start, timeZone),
      created: validDate(event.created),
      lastModified: validDate(event.lastmodified),
      hasRRule: Boolean(event.rrule),
    });
  }

  return events;
}

/**
 * Pulls the UID out of iCalendar text that `parseIcs` rejected, so sync can
 * leave that event's row alone instead of treating it as deleted.
 */
export function findUid(icsText: string): string | null {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const match = /^UID(?:;[^:\r\n]*)?:(.+)$/m.exec(unfolded);
  return match ? match[1].trim() || null : null;
}
