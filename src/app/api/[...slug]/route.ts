// Catch-all for unknown /api/* paths: API clients get a JSON 404 in the
// usual error shape, never the soft-404 HTML redirect chain (ADR-005).
function notFoundJson() {
  return Response.json({ error: "Not found." }, { status: 404 });
}

export {
  notFoundJson as DELETE,
  notFoundJson as GET,
  notFoundJson as PATCH,
  notFoundJson as POST,
  notFoundJson as PUT,
};
