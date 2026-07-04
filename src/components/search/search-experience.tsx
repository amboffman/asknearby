"use client";
// The Week C demo surface: sentence in, synced list + map out.
// Sync contract: hovering a row highlights its pin; hovering a pin
// highlights its row; clicking a pin selects and scrolls its row into view.
import { type FormEvent, useRef, useState } from "react";

import { StoreMap, type StoreMapMarker } from "@/components/store-map";
import { type SearchOutcome } from "@/lib/search";
import { type Coordinates } from "@/lib/types/geo";
import { type StoreDetails } from "@/lib/types/store";

import { NoResults } from "./no-results";
import { StoreDetailPanel } from "./store-detail-panel";

const EXAMPLE_SENTENCE = "a location with a men's department and free parking near Columbus";

export function SearchExperience() {
  const [sentence, setSentence] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StoreDetails | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const detailCache = useRef(new Map<number, StoreDetails>());
  const selectedIdRef = useRef<number | null>(null);

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

  async function runSearch(q: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q, userLocation: userLocation ?? undefined }),
      });
      const body = (await response.json()) as SearchOutcome & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Search failed.");
      setOutcome(body);
      setHighlightedId(null);
      closeDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sentence.trim() && !pending) void runSearch(sentence.trim());
  }

  /** Shared by row clicks and pin clicks: select + open the detail panel. */
  function selectStore(id: number) {
    setSelectedId(id);
    selectedIdRef.current = id;
    rowRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    void loadDetails(id);
  }

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

  const markers: StoreMapMarker[] =
    outcome?.stores.map((store) => ({
      id: store.id,
      slug: store.slug,
      name: store.name,
      latitude: store.latitude,
      longitude: store.longitude,
    })) ?? [];

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-neutral-200 px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight">AskNearby</h1>
            <p className="text-sm text-neutral-500">Just say what you&apos;re looking for.</p>
          </div>
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder={`e.g. "${EXAMPLE_SENTENCE}"`}
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
              maxLength={300}
            />
            <button
              type="button"
              onClick={toggleMyLocation}
              disabled={locating}
              title="Search near your location when no place is named"
              className={`rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-40 ${
                userLocation
                  ? "border-teal-800 bg-teal-50 text-teal-900"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
              }`}
            >
              {locating ? "Locating…" : userLocation ? "✓ Near me" : "Near me"}
            </button>
            <button
              type="submit"
              disabled={pending || !sentence.trim()}
              className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? "Searching…" : "Search"}
            </button>
          </form>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {outcome?.unresolvedPlaceName && (
            <p className="text-sm text-amber-700">
              Couldn&apos;t place &quot;{outcome.unresolvedPlaceName}&quot; — showing matches
              everywhere.
            </p>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(340px,2fr)_3fr]">
        <section className="min-h-0 overflow-y-auto border-r border-neutral-200">
          {selectedId !== null ? (
            <StoreDetailPanel details={detail} onBack={closeDetails} />
          ) : outcome === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-neutral-500">
                Try a sentence like{" "}
                <button
                  type="button"
                  className="text-teal-800 underline underline-offset-2"
                  onClick={() => {
                    setSentence(EXAMPLE_SENTENCE);
                    void runSearch(EXAMPLE_SENTENCE);
                  }}
                >
                  &quot;{EXAMPLE_SENTENCE}&quot;
                </button>
              </p>
            </div>
          ) : outcome.stores.length === 0 ? (
            <NoResults outcome={outcome} />
          ) : (
            <ul>
              {outcome.stores.map((store) => {
                const active = store.id === highlightedId || store.id === selectedId;
                return (
                  <li
                    key={store.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(store.id, el);
                      else rowRefs.current.delete(store.id);
                    }}
                    onMouseEnter={() => setHighlightedId(store.id)}
                    onMouseLeave={() => setHighlightedId(null)}
                    onClick={() => selectStore(store.id)}
                    className={`cursor-pointer border-b border-neutral-100 px-4 py-3 transition-colors ${
                      active ? "bg-amber-50" : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{store.name}</span>
                      {store.distanceMeters !== null && (
                        <span className="shrink-0 text-sm text-neutral-500">
                          {(store.distanceMeters / 1000).toFixed(1)} km
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-600">
                      {store.streetAddress}, {store.city}, {store.state} {store.postalCode}
                    </p>
                    <p className="text-sm text-neutral-500">{store.phone}</p>
                  </li>
                );
              })}
            </ul>
          )}
          {outcome && (
            <details className="border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600">
              <summary className="cursor-pointer select-none">
                Parsed query ({outcome.stores.length} result
                {outcome.stores.length === 1 ? "" : "s"})
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-neutral-50 p-3 text-xs">
                {JSON.stringify(outcome.query, null, 2)}
              </pre>
            </details>
          )}
        </section>

        <StoreMap
          className="min-h-[320px]"
          markers={markers}
          highlightedId={highlightedId}
          selectedId={selectedId}
          onMarkerClick={selectStore}
          onMarkerHoverChange={setHighlightedId}
        />
      </div>
    </div>
  );
}
