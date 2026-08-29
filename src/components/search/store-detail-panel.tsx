"use client";
// Week D detail panel, restyled as a slide-over (ADR-004): open/closed
// badge, today's hours emphasized, directions as the primary action.
// The directions link stays a Google Maps universal URL: a link, not an
// SDK call, so it lives outside the vendor seam.
import { type AttributeCategory, type StoreDetails } from "@/lib/types/store";

import { CATEGORY_LABELS, DAY_NAMES, formatTime, localDayAndTime, openStatus } from "./format";

const CATEGORY_ORDER: AttributeCategory[] = ["department", "service", "amenity", "parking"];

export function StoreDetailPanel({
  details,
  onBack,
}: {
  details: StoreDetails | null;
  onBack: () => void;
}) {
  // The store's local weekday, not the viewer's: a viewer a timezone ahead
  // would otherwise see tomorrow's row flagged "Today" while the OpenBadge
  // (store-local) still reports today's status.
  const todayIndex = details === null ? -1 : localDayAndTime(new Date(), details.timezone).day;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-medium text-cedar-800 hover:text-cedar-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600"
        >
          <span aria-hidden>←</span> Results
        </button>
      </div>

      {details === null ? (
        <DetailSkeleton />
      ) : (
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-cedar-950">{details.name}</h2>
              <OpenBadge details={details} />
            </div>
            <p className="text-sm text-neutral-600">
              {details.streetAddress}, {details.city}, {details.state} {details.postalCode}
            </p>
            <p className="text-sm text-neutral-500 tabular-nums">{details.phone}</p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${details.latitude},${details.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-cedar-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cedar-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600"
            >
              Get directions <span aria-hidden>↗</span>
            </a>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Hours
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {DAY_NAMES.map((day, dayOfWeek) => {
                  const entry = details.hours.find((h) => h.dayOfWeek === dayOfWeek);
                  const today = todayIndex === dayOfWeek;
                  return (
                    <tr key={day} className={today ? "font-semibold text-cedar-900" : ""}>
                      <td className="py-0.5 pr-4 text-neutral-600">
                        {day}
                        {today && (
                          <span className="ml-2 rounded-full bg-cedar-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cedar-800">
                            Today
                          </span>
                        )}
                      </td>
                      <td className="py-0.5 tabular-nums">
                        {entry ? (
                          `${formatTime(entry.opensAt)} – ${formatTime(entry.closesAt)}`
                        ) : (
                          <span className="text-neutral-400">Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {CATEGORY_ORDER.map((category) => {
            const items = details.attributes.filter((a) => a.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((attribute) => (
                    <span
                      key={attribute.slug}
                      className="rounded-full bg-cedar-100 px-2.5 py-1 text-xs font-medium text-cedar-900"
                    >
                      {attribute.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OpenBadge({ details }: { details: StoreDetails }) {
  const status = openStatus(details.hours, details.timezone);
  return (
    <span
      className={`mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        status.isOpen ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"
      }`}
    >
      {status.isOpen ? "Open" : "Closed"}
    </span>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden className="space-y-4 p-5 motion-safe:animate-pulse">
      <div className="h-6 w-3/4 rounded bg-neutral-200" />
      <div className="h-4 w-2/3 rounded bg-neutral-100" />
      <div className="h-9 w-36 rounded-full bg-neutral-200" />
      <div className="space-y-2 pt-4">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-3.5 w-1/2 rounded bg-neutral-100" />
        ))}
      </div>
    </div>
  );
}
