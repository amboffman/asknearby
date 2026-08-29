// Vendor-neutral SVG glyphs for the non-store map anchors (ADR-006),
// shared by both adapters so the two vendors stay visually identical.
// Colors mirror the pin palette: ember for search context, classic blue
// for the you-are-here dot.

/** Ember target ring marking where the search looked. */
export function SearchedAreaGlyph() {
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" style={{ display: "block" }}>
      <circle cx="13" cy="13" r="12" fill="#b45309" fillOpacity="0.18" />
      <circle cx="13" cy="13" r="8" fill="#ffffff" fillOpacity="0.85" />
      <circle cx="13" cy="13" r="8" fill="none" stroke="#b45309" strokeWidth="2.5" />
      <circle cx="13" cy="13" r="3" fill="#b45309" />
    </svg>
  );
}

/** Classic blue you-are-here dot shown while "Near me" is armed. */
export function UserLocationGlyph() {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" style={{ display: "block" }}>
      <circle cx="11" cy="11" r="10.5" fill="#2563eb" fillOpacity="0.22" />
      <circle cx="11" cy="11" r="5.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * A near-me search centers on the user's own coordinates; stacking the
 * searched-area ring on the you-are-here dot would just be clutter, so
 * adapters render only the dot when the two coincide.
 */
export function sameSpot(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}
