"use client";
// The demo surface (ADR-004): a white-label Cedar & Main store finder.
// Sentence in → translated SearchQuery rendered as removable chips → synced
// list + map. Chip edits re-run through /api/search/query — deterministic,
// no second model call. Sync contract: hover/focus a row highlights its
// pin; hover a pin highlights its row; click either selects and opens the
// detail slide-over.
import { type FormEvent, useEffect, useRef, useState } from "react";

import { StoreMap, type StoreMapMarker } from "@/components/store-map";
import { type SearchOutcome } from "@/lib/search";
import { type Coordinates } from "@/lib/types/geo";
import { type SearchQuery } from "@/lib/types/search-query";
import { type StoreDetails, type StoreSearchResult } from "@/lib/types/store";

import { formatDistanceMiles, openStatus } from "./format";
import { NoResults } from "./no-results";
import { QueryChips } from "./query-chips";
import { StoreDetailPanel } from "./store-detail-panel";

/** One-click example sentences — every attribute is real catalog data. */
const EXAMPLES = [
  "a men's department and free parking near Columbus",
  "which stores are open right now in Chicago?",
  "curbside pickup and EV charging near Indianapolis",
  "pet-friendly stores in Cincinnati",
];

/** Live stack identifiers for the footer strip (resolved server-side). */
export interface StackInfo {
  modelId: string;
  mapsProvider: string;
}

export function SearchExperience({
  initialStores,
  stack,
}: {
  /** Browse mode: every store, rendered before the first search. */
  initialStores: StoreSearchResult[];
  stack: StackInfo;
}) {
  const [sentence, setSentence] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StoreDetails | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const detailCache = useRef(new Map<number, StoreDetails>());
  const selectedIdRef = useRef<number | null>(null);
  // Race guards for postSearch: only the latest request may apply state,
  // and the submit gate reads a ref (state is stale within a frame).
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);

  // "/" focuses the search box; Escape closes the detail slide-over.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape" && selectedIdRef.current !== null) closeDetails();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** "Near me": browser geolocation, with typed-place as the fallback. */
  function toggleMyLocation() {
    if (userLocation) {
      setUserLocation(null);
      return;
    }
    if (!("geolocation" in navigator)) {
      setError("Location isn't available — name a place instead (e.g. “near Columbus”).");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setError(null);
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location — name a place instead (e.g. “near Columbus”).");
      },
      { timeout: 8_000, maximumAge: 300_000 },
    );
  }

  async function postSearch(path: string, body: unknown) {
    const seq = ++requestSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      // ok-check before trusting the body: a gateway 502/504 returns HTML,
      // and its JSON parse error must not surface as the user-facing message.
      let outcomeBody: (SearchOutcome & { error?: string }) | null = null;
      try {
        outcomeBody = (await response.json()) as SearchOutcome & { error?: string };
      } catch {
        outcomeBody = null;
      }
      if (!response.ok || outcomeBody === null) {
        throw new Error(outcomeBody?.error ?? `Search failed (HTTP ${response.status}).`);
      }
      if (seq !== requestSeqRef.current) return null; // superseded by a newer search
      setElapsedMs(Math.round(performance.now() - startedAt));
      setOutcome(outcomeBody);
      setHighlightedId(null);
      closeDetails();
      return outcomeBody;
    } catch (err) {
      // An aborted request was superseded; its error belongs to nobody.
      if (seq !== requestSeqRef.current || controller.signal.aborted) return null;
      setError(err instanceof Error ? err.message : "Search failed.");
      return null;
    } finally {
      if (seq === requestSeqRef.current) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  /** Sentence → model translation → results (the paid path). */
  async function runSearch(q: string) {
    const result = await postSearch("/api/search", {
      q,
      userLocation: userLocation ?? undefined,
    });
    if (!result) return;
    setPlaceLabel(
      result.query.geo.kind === "place"
        ? result.query.geo.placeName
        : result.query.geo.kind === "coordinates"
          ? "you"
          : null,
    );
  }

  /** Edited query → results, deterministically — no model call (ADR-004). */
  async function runQuery(query: SearchQuery) {
    // The query endpoint rejects raw place names (it must never pay the
    // geocoder), so reuse the already-resolved center — or, when the first
    // geocode failed (unresolvedPlaceName), drop geo to match the original
    // unlocated search.
    const requery: SearchQuery =
      query.geo.kind !== "place"
        ? query
        : outcome?.center
          ? { ...query, geo: { kind: "coordinates", ...outcome.center } }
          : { ...query, geo: { kind: "none" }, radiusKm: undefined };
    await postSearch("/api/search/query", { query: requery });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // pendingRef, not pending: two Enter presses in the same frame both see
    // the stale state value, and each duplicate is a paid model call.
    if (sentence.trim() && !pendingRef.current) void runSearch(sentence.trim());
  }

  /** Shared by row clicks and pin clicks: select + open the slide-over. */
  function selectStore(id: number) {
    setSelectedId(id);
    selectedIdRef.current = id;
    setMobileView("list"); // the slide-over lives in the list pane
    void loadDetails(id);
  }

  // Scroll the selected row into view AFTER render: on mobile a pin tap
  // fires while the list pane is still display:none, where an immediate
  // scrollIntoView is a no-op.
  useEffect(() => {
    if (selectedId === null) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  function closeDetails() {
    setSelectedId(null);
    selectedIdRef.current = null;
    setDetail(null);
  }

  async function loadDetails(id: number) {
    const cached = detailCache.current.get(id);
    if (cached) {
      setDetail(cached);
      return;
    }
    setDetail(null);
    try {
      const response = await fetch(`/api/stores/${id}`);
      if (!response.ok) throw new Error("Store lookup failed.");
      const data = (await response.json()) as StoreDetails;
      detailCache.current.set(id, data);
      // Ignore stale responses if the user has moved on.
      if (selectedIdRef.current === id) setDetail(data);
    } catch {
      if (selectedIdRef.current === id) {
        closeDetails();
        setError("Couldn't load store details — try again.");
      }
    }
  }

  const stores = outcome?.stores ?? initialStores;
  const browsing = outcome === null;
  const markers: StoreMapMarker[] = stores.map((store, index) => ({
    id: store.id,
    slug: store.slug,
    name: store.name,
    latitude: store.latitude,
    longitude: store.longitude,
    // Numbered pins mirror the numbered rows; browse mode stays unnumbered.
    ...(browsing ? {} : { ordinal: index + 1 }),
  }));

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="border-b border-cedar-950/50 bg-cedar-800 px-4 py-3 text-cedar-50 md:py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="flex items-baseline gap-2">
              <span className="font-display text-xl font-bold tracking-tight text-white">
                Cedar &amp; Main
              </span>
              <span className="text-[10px] font-semibold tracking-[0.28em] text-cedar-300">
                OUTFITTERS
              </span>
            </h1>
            <p className="hidden font-mono text-[11px] text-cedar-300 sm:block">
              store finder · powered by{" "}
              <span className="font-semibold text-cedar-100">AskNearby</span>
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-4 shadow-lg shadow-cedar-950/30"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 fill-ember-600"
              // The AI affordance: this box takes sentences, not keywords.
            >
              <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
            </svg>
            <input
              ref={inputRef}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder="Describe what you need — “alterations, open now, near me”"
              aria-label="Describe what you're looking for"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-neutral-400"
              maxLength={300}
            />
            <kbd className="hidden rounded border border-neutral-200 px-1.5 font-mono text-[11px] text-neutral-400 md:block">
              /
            </kbd>
            <button
              type="button"
              onClick={toggleMyLocation}
              disabled={locating}
              title="Search near your location when no place is named"
              aria-pressed={userLocation !== null}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600 ${
                userLocation
                  ? "border-cedar-300 bg-cedar-50 text-cedar-800"
                  : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
              }`}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5">
                <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                <path
                  d="M12 1v4M12 19v4M1 12h4M19 12h4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="hidden sm:inline">{locating ? "Locating…" : "Near me"}</span>
            </button>
            <button
              type="submit"
              disabled={pending || !sentence.trim()}
              className="flex shrink-0 items-center gap-2 rounded-full bg-cedar-800 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cedar-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600"
            >
              {pending && (
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              )}
              Search
            </button>
          </form>

          {outcome && (
            <QueryChips
              query={outcome.query}
              placeLabel={placeLabel}
              resultCount={outcome.stores.length}
              elapsedMs={elapsedMs}
              busy={pending}
              showJson={showJson}
              onRemoveAttribute={(slug) =>
                runQuery({
                  ...outcome.query,
                  attributeSlugs: outcome.query.attributeSlugs.filter((s) => s !== slug),
                })
              }
              onRemoveGeo={() =>
                runQuery({ ...outcome.query, geo: { kind: "none" }, radiusKm: undefined })
              }
              onRemoveOpenNow={() => runQuery({ ...outcome.query, openNow: false })}
              onToggleJson={() => setShowJson((v) => !v)}
            />
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}
          {outcome?.unresolvedPlaceName && (
            <p className="text-sm text-amber-300">
              Couldn&apos;t place &quot;{outcome.unresolvedPlaceName}&quot; — showing matches
              everywhere.
            </p>
          )}
        </div>
      </header>

      {/* Mobile: one pane at a time. Desktop shows both, so this bar hides.
          Plain toggle buttons, not role="tab": the full ARIA tabs contract
          (tabpanels, roving tabindex, arrow keys) isn't implemented here. */}
      <div
        aria-label="Results view"
        className="flex gap-1 border-b border-neutral-200 bg-white p-1 md:hidden"
      >
        {(["list", "map"] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={mobileView === view}
            onClick={() => setMobileView(view)}
            className={`flex-1 rounded-full py-1.5 text-sm font-semibold capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600 ${
              mobileView === view ? "bg-cedar-800 text-white" : "text-neutral-500"
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(360px,2fr)_3fr]">
        <section
          aria-label="Store results"
          className={`relative min-h-0 overflow-hidden border-r border-neutral-200 bg-white ${
            mobileView === "map" ? "hidden md:block" : "block"
          }`}
        >
          <div className="flex h-full flex-col">
            {outcome && outcome.stores.length > 0 && (
              <div className="flex items-baseline justify-between border-b border-neutral-100 px-4 py-2.5">
                <p aria-live="polite" className="text-sm font-semibold">
                  {outcome.stores.length}
                  {outcome.truncated ? "+" : ""} store{outcome.stores.length === 1 ? "" : "s"}
                  {outcome.truncated && (
                    <span className="font-normal text-neutral-500">
                      {" "}
                      · first {outcome.stores.length} shown
                    </span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">
                  {outcome.stores[0]?.distanceMeters !== null ? "Nearest first" : "A to Z"}
                </p>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {pending ? (
                <SkeletonRows />
              ) : browsing ? (
                <Welcome
                  storeCount={initialStores.length}
                  onExample={(example) => {
                    setSentence(example);
                    void runSearch(example);
                  }}
                />
              ) : outcome.stores.length === 0 ? (
                <NoResults outcome={outcome} />
              ) : (
                <ul>
                  {outcome.stores.map((store, index) => {
                    const active = store.id === highlightedId || store.id === selectedId;
                    return (
                      <li
                        key={store.id}
                        ref={(el) => {
                          if (el) rowRefs.current.set(store.id, el);
                          else rowRefs.current.delete(store.id);
                        }}
                        className="border-b border-neutral-100"
                      >
                        <button
                          type="button"
                          onClick={() => selectStore(store.id)}
                          onMouseEnter={() => setHighlightedId(store.id)}
                          onMouseLeave={() => setHighlightedId(null)}
                          onFocus={() => setHighlightedId(store.id)}
                          onBlur={() => setHighlightedId(null)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ember-600 ${
                            active ? "bg-ember-50" : "hover:bg-neutral-50"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                              active ? "bg-ember-600" : "bg-cedar-800"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{store.name}</span>
                            <StatusLine store={store} />
                            <span className="block text-sm text-neutral-500">
                              {store.streetAddress}, {store.city}, {store.state} {store.postalCode}
                            </span>
                          </span>
                          {store.distanceMeters !== null && (
                            <span className="shrink-0 text-sm font-semibold text-neutral-600 tabular-nums">
                              {formatDistanceMiles(store.distanceMeters)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {selectedId !== null && (
            <div className="slide-in absolute inset-0 z-20 bg-white">
              <StoreDetailPanel details={detail} onBack={closeDetails} />
            </div>
          )}
        </section>

        <div
          className={`relative min-h-[320px] ${mobileView === "list" ? "hidden md:block" : "block"}`}
        >
          <StoreMap
            className="h-full w-full"
            markers={markers}
            highlightedId={highlightedId}
            selectedId={selectedId}
            onMarkerClick={selectStore}
            onMarkerHoverChange={setHighlightedId}
          />
          {showJson && outcome && (
            <div className="absolute right-3 top-3 z-10 w-80 max-w-[calc(100%-1.5rem)] rounded-lg bg-cedar-950/95 p-3 text-cedar-100 shadow-xl">
              <div className="flex items-center justify-between pb-1">
                <span className="font-mono text-[11px] font-semibold">SearchQuery</span>
                <button
                  type="button"
                  onClick={() => setShowJson(false)}
                  aria-label="Hide query JSON"
                  className="px-1 text-cedar-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-500"
                >
                  ✕
                </button>
              </div>
              <pre className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed">
                {JSON.stringify(outcome.query, null, 2)}
              </pre>
              <p className="border-t border-cedar-800 pt-2 font-mono text-[10px] text-cedar-400">
                one forced tool call — the model translates, the database answers
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="hidden items-center gap-5 border-t border-neutral-200 bg-white px-4 py-1.5 font-mono text-[11px] text-neutral-500 md:flex">
        <span>
          NL → <span className="font-semibold text-cedar-800">{stack.modelId}</span> → SearchQuery
        </span>
        <span>
          geo: <span className="font-semibold text-cedar-800">PostGIS ST_DWithin</span>
        </span>
        <span>
          map: <span className="font-semibold text-cedar-800">{stack.mapsProvider}</span>
        </span>
        <span className="ml-auto text-neutral-400">model &amp; map each swap with one env var</span>
      </footer>
    </div>
  );
}

/** "Open · closes 9 PM" / "Closed · opens 10 AM Thu", store-local. */
function StatusLine({ store }: { store: StoreSearchResult }) {
  if (!store.hours) return null;
  const status = openStatus(store.hours, store.timezone);
  return (
    <span className="block text-xs">
      <span
        className={
          status.isOpen ? "font-semibold text-green-700" : "font-semibold text-neutral-500"
        }
      >
        {status.isOpen ? "Open" : "Closed"}
      </span>
      {status.detail && <span className="text-neutral-500"> · {status.detail}</span>}
    </span>
  );
}

function Welcome({
  storeCount,
  onExample,
}: {
  storeCount: number;
  onExample: (example: string) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-8">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-cedar-600">
        AskNearby demo
      </p>
      <h2 className="font-display text-2xl font-bold text-cedar-950">
        Find your nearest Cedar &amp; Main
      </h2>
      <p className="text-sm text-neutral-600">
        Say it in one sentence — departments, services, parking, hours. The AI translates your words
        into a typed query; the database does the finding.
      </p>
      <div className="flex flex-col items-start gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onExample(example)}
            className="rounded-full border border-cedar-200 bg-cedar-50 px-4 py-1.5 text-left text-sm text-cedar-800 transition-colors hover:border-cedar-400 hover:bg-cedar-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-600"
          >
            “{example}”
          </button>
        ))}
      </div>
      {storeCount > 0 && (
        <p className="text-xs text-neutral-400">
          …or just browse — all {storeCount} stores are on the map.
        </p>
      )}
    </div>
  );
}

/** Result-shaped placeholders while the model call is in flight. */
function SkeletonRows() {
  return (
    <ul aria-hidden className="motion-safe:animate-pulse">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-start gap-3 border-b border-neutral-100 px-4 py-3">
          <span className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full bg-neutral-200" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
            <span className="h-3.5 w-2/3 rounded bg-neutral-200" />
            <span className="h-3 w-1/3 rounded bg-neutral-100" />
            <span className="h-3 w-4/5 rounded bg-neutral-100" />
          </span>
          <span className="h-3.5 w-10 rounded bg-neutral-200" />
        </li>
      ))}
    </ul>
  );
}
