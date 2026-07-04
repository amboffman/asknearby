"use client";
// The signature moment (ADR-004): the model's SearchQuery rendered as
// human-readable, removable chips the instant results land. Removing one
// re-runs the search deterministically — no second model call.
import { type SearchQuery } from "@/lib/types/search-query";

import { attributeLabel } from "./format";

const MILES_PER_KM = 1 / 1.609344;

export function QueryChips({
  query,
  placeLabel,
  resultCount,
  elapsedMs,
  busy,
  showJson,
  onRemoveAttribute,
  onRemoveGeo,
  onRemoveOpenNow,
  onToggleJson,
}: {
  query: SearchQuery;
  /** Display name for the geo chip (survives the geo→coordinates re-run swap). */
  placeLabel: string | null;
  resultCount: number;
  elapsedMs: number | null;
  busy: boolean;
  showJson: boolean;
  onRemoveAttribute: (slug: string) => void;
  onRemoveGeo: () => void;
  onRemoveOpenNow: () => void;
  onToggleJson: () => void;
}) {
  const chipClass =
    "group flex items-center gap-1.5 rounded-full border border-cedar-400/60 " +
    "bg-white/10 px-3 py-1 text-xs font-medium text-cedar-50 transition-colors " +
    "hover:border-ember-500 hover:bg-white/20 disabled:opacity-50 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-500";

  const geoLabel =
    query.geo.kind === "place"
      ? query.geo.placeName
      : query.geo.kind === "coordinates"
        ? (placeLabel ?? "near you")
        : null;
  const radiusSuffix = query.radiusKm
    ? ` · ${Math.max(1, Math.round(query.radiusKm * MILES_PER_KM))} mi`
    : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {query.attributeSlugs.map((slug) => (
        <button
          key={slug}
          type="button"
          disabled={busy}
          onClick={() => onRemoveAttribute(slug)}
          title={`Remove "${attributeLabel(slug)}" and re-run (no AI call)`}
          className={chipClass}
        >
          {attributeLabel(slug)}
          <span aria-hidden className="text-cedar-300 group-hover:text-ember-500">
            ✕
          </span>
        </button>
      ))}
      {geoLabel && (
        <button
          type="button"
          disabled={busy}
          onClick={onRemoveGeo}
          title="Remove the location filter and re-run (no AI call)"
          className={`${chipClass} border-ember-500/70`}
        >
          <span aria-hidden className="text-ember-500">
            ◎
          </span>
          near {geoLabel}
          {radiusSuffix}
          <span aria-hidden className="text-cedar-300 group-hover:text-ember-500">
            ✕
          </span>
        </button>
      )}
      {query.openNow && (
        <button
          type="button"
          disabled={busy}
          onClick={onRemoveOpenNow}
          title="Remove the open-now filter and re-run (no AI call)"
          className={chipClass}
        >
          Open now
          <span aria-hidden className="text-cedar-300 group-hover:text-ember-500">
            ✕
          </span>
        </button>
      )}
      <span aria-live="polite" className="text-xs text-cedar-300">
        {resultCount} match{resultCount === 1 ? "" : "es"}
        {elapsedMs !== null && ` · ${(elapsedMs / 1000).toFixed(1)} s`}
      </span>
      <button
        type="button"
        onClick={onToggleJson}
        className="font-mono text-[11px] text-cedar-200 underline decoration-cedar-400 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-500"
      >
        {"{ }"} {showJson ? "hide" : "view"} query
      </button>
    </div>
  );
}
