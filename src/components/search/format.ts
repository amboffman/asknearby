// Pure display formatting for search results and store details
// (unit-tested).
// ATTRIBUTE_CATALOG is pure hand-authored data (no SQL, no client), so a
// display-label lookup may import it without crossing the lib/db boundary.
import { ATTRIBUTE_CATALOG } from "@/lib/db/seed-data";
import { type AttributeCategory, type StoreHoursEntry } from "@/lib/types/store";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DAY_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const CATEGORY_LABELS: Record<AttributeCategory, string> = {
  department: "Departments",
  service: "Services",
  amenity: "Amenities",
  parking: "Parking",
};

/** "HH:MM" 24h → "h[:MM] AM/PM" (US retail style). */
export function formatTime(hhmm: string): string {
  const [hourRaw = 0, minute = 0] = hhmm.split(":").map(Number);
  const period = hourRaw < 12 ? "AM" : "PM";
  const hour = hourRaw % 12 === 0 ? 12 : hourRaw % 12;
  return minute === 0
    ? `${hour} ${period}`
    : `${hour}:${String(minute).padStart(2, "0")} ${period}`;
}

const METERS_PER_MILE = 1609.344;

/**
 * Distance for a US chain: miles, one decimal up close, whole miles once
 * the decimal stops meaning anything (storage stays metric).
 */
export function formatDistanceMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  return miles >= 15 ? `${Math.round(miles)} mi` : `${miles.toFixed(1)} mi`;
}

/** Human label for a catalog slug; unknown slugs degrade to de-slugged text. */
export function attributeLabel(slug: string): string {
  return ATTRIBUTE_CATALOG.find((a) => a.slug === slug)?.label ?? slug.replace(/-/g, " ");
}

export interface OpenStatus {
  isOpen: boolean;
  /** "closes 9 PM" | "opens 10 AM" | "opens 10 AM Thu" | null (no hours). */
  detail: string | null;
}

// Intl.DateTimeFormat construction is expensive and openStatus runs per
// list row per render (hover re-renders every row), so cache per timezone.
const dayTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function dayTimeFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = dayTimeFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    dayTimeFormatters.set(timezone, formatter);
  }
  return formatter;
}

/** The instant rendered as the store's local weekday index and "HH:MM". */
export function localDayAndTime(now: Date, timezone: string): { day: number; hhmm: string } {
  const parts = dayTimeFormatter(timezone).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: DAY_ABBREV.indexOf(get("weekday") as (typeof DAY_ABBREV)[number]),
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

/**
 * Open/closed right now, evaluated in the store's own timezone — the same
 * rule the openNow SQL applies, restated for display ("HH:MM" strings
 * compare correctly as text).
 */
export function openStatus(
  hours: StoreHoursEntry[],
  timezone: string,
  now: Date = new Date(),
): OpenStatus {
  if (hours.length === 0) return { isOpen: false, detail: null };
  const { day, hhmm } = localDayAndTime(now, timezone);

  const today = hours.find((h) => h.dayOfWeek === day);
  if (today && hhmm >= today.opensAt && hhmm < today.closesAt) {
    return { isOpen: true, detail: `closes ${formatTime(today.closesAt)}` };
  }
  if (today && hhmm < today.opensAt) {
    return { isOpen: false, detail: `opens ${formatTime(today.opensAt)}` };
  }
  for (let offset = 1; offset <= 7; offset++) {
    const entry = hours.find((h) => h.dayOfWeek === (day + offset) % 7);
    if (entry) {
      return {
        isOpen: false,
        detail: `opens ${formatTime(entry.opensAt)} ${DAY_ABBREV[entry.dayOfWeek]}`,
      };
    }
  }
  return { isOpen: false, detail: null };
}
