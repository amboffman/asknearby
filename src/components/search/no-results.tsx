"use client";
// Week D no-results handling: say WHICH filter matched nothing instead of
// a bare empty state (the silent-zero is the locator failure mode ADR-001
// keeps calling out).
import { type SearchOutcome } from "@/lib/search";

function prettify(slug: string): string {
  return slug.replace(/-/g, " ");
}

export function NoResults({ outcome }: { outcome: SearchOutcome }) {
  const diagnosis = outcome.noResults;
  const slugs = outcome.query.attributeSlugs;

  const zeroSlugs =
    diagnosis?.attributeCounts.filter((a) => a.storeCount === 0).map((a) => a.slug) ?? [];

  return (
    <div className="space-y-3 p-8 text-center">
      <p className="font-medium text-neutral-700">No matching stores</p>

      {zeroSlugs.length > 0 ? (
        <p className="text-sm text-neutral-600">
          No store in the chain offers:{" "}
          <span className="font-medium">{zeroSlugs.map(prettify).join(", ")}</span>. Try dropping{" "}
          {zeroSlugs.length === 1 ? "that filter" : "those filters"}.
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
              <span className="font-medium">
                {(diagnosis.nearestDistanceMeters / 1000).toFixed(0)} km away
              </span>
            </>
          )}
          . Try a wider radius or a different place.
        </p>
      ) : slugs.length > 1 ? (
        <p className="text-sm text-neutral-600">
          Stores offer <span className="font-medium">{slugs.map(prettify).join(", ")}</span>{" "}
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
    </div>
  );
}
