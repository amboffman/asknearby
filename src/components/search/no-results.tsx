"use client";
// Week D no-results handling: say WHICH filter matched nothing instead of
// a bare empty state (the silent-zero is the locator failure mode ADR-001
// keeps calling out). Restyled as a designed card (ADR-004).
import { type SearchOutcome } from "@/lib/search";

import { attributeLabel, formatDistanceMiles } from "./format";

export function NoResults({ outcome }: { outcome: SearchOutcome }) {
  const diagnosis = outcome.noResults;
  const slugs = outcome.query.attributeSlugs;

  const zeroSlugs =
    diagnosis?.attributeCounts.filter((a) => a.storeCount === 0).map((a) => a.slug) ?? [];

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center">
        <span
          aria-hidden
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-cedar-800" strokeWidth="2">
            <path d="M12 21s-7-5.7-7-11a7 7 0 0 1 14 0c0 5.3-7 11-7 11z" />
            <path d="M9 10.5l6-1M9 13.5l6-1" strokeLinecap="round" />
          </svg>
        </span>
        <p className="font-display text-lg font-bold text-cedar-950">No matching stores</p>

        {zeroSlugs.length > 0 ? (
          <p className="text-sm text-neutral-600">
            No store in the chain offers:{" "}
            <span className="font-semibold">{zeroSlugs.map(attributeLabel).join(", ")}</span>. Try
            dropping {zeroSlugs.length === 1 ? "that filter" : "those filters"}.
          </p>
        ) : diagnosis && diagnosis.matchesIgnoringLocation > 0 ? (
          <p className="text-sm text-neutral-600">
            {diagnosis.matchesIgnoringLocation} store
            {diagnosis.matchesIgnoringLocation === 1 ? "" : "s"} match
            {diagnosis.matchesIgnoringLocation === 1 ? "es" : ""} your filters
            {diagnosis.nearestDistanceMeters !== null && (
              <>
                {" "}
                — the nearest is{" "}
                <span className="font-semibold">
                  {formatDistanceMiles(diagnosis.nearestDistanceMeters)} away
                </span>
              </>
            )}
            . Try a wider radius or a different place.
          </p>
        ) : slugs.length > 1 ? (
          <p className="text-sm text-neutral-600">
            Stores offer{" "}
            <span className="font-semibold">{slugs.map(attributeLabel).join(", ")}</span>{" "}
            individually, but no single store has the full combination
            {outcome.query.openNow && " that is open right now"}. Try removing a filter
            {outcome.query.openNow && " or searching without “open now”"}.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            {outcome.query.openNow
              ? "Stores matching your search are closed right now — try again during opening hours."
              : "Try different filters or another place."}
          </p>
        )}
        <p className="text-xs text-neutral-400">
          Tip: remove a chip above to widen the search — it re-runs instantly.
        </p>
      </div>
    </div>
  );
}
