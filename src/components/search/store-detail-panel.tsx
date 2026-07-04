"use client";
// Week D detail panel: attributes grouped by category, weekly hours, and a
// directions link (Google Maps universal URL — a link, not an SDK call, so
// it stays outside the vendor seam).
import { type AttributeCategory, type StoreDetails } from "@/lib/types/store";

import { CATEGORY_LABELS, DAY_NAMES, formatTime } from "./format";

const CATEGORY_ORDER: AttributeCategory[] = ["department", "service", "amenity", "parking"];

export function StoreDetailPanel({
  details,
  onBack,
}: {
  details: StoreDetails | null;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-teal-800 underline-offset-2 hover:underline"
        >
          ← Back to results
        </button>
      </div>

      {details === null ? (
        <div className="p-8 text-center text-neutral-400">Loading…</div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div>
            <h2 className="text-lg font-semibold">{details.name}</h2>
            <p className="text-sm text-neutral-600">
              {details.streetAddress}, {details.city}, {details.state} {details.postalCode}
            </p>
            <p className="text-sm text-neutral-500">{details.phone}</p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${details.latitude},${details.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm font-medium text-teal-800 underline-offset-2 hover:underline"
            >
              Get directions ↗
            </a>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold text-neutral-700">Hours</h3>
            <table className="w-full text-sm">
              <tbody>
                {DAY_NAMES.map((day, dayOfWeek) => {
                  const entry = details.hours.find((h) => h.dayOfWeek === dayOfWeek);
                  const today = new Date().getDay() === dayOfWeek;
                  return (
                    <tr key={day} className={today ? "font-medium" : ""}>
                      <td className="py-0.5 pr-4 text-neutral-600">{day}</td>
                      <td className="py-0.5">
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
                <h3 className="mb-1 text-sm font-semibold text-neutral-700">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((attribute) => (
                    <span
                      key={attribute.slug}
                      className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs text-teal-900"
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
