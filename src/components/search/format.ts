// Pure display formatting for store details (unit-tested).
import { type AttributeCategory } from "@/lib/types/store";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

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
