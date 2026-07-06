// GET /api/stores/:id — attributes + weekly hours for the detail panel.
import { getDb, getStoreDetails } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Strict digits only: Number() also accepts "1e3"/"0x10"/whitespace, and
  // ids past int4 range would become driver-level 500s instead of 400s.
  if (!/^\d{1,9}$/.test(id)) {
    return Response.json({ error: "Invalid store id." }, { status: 400 });
  }
  const storeId = Number(id);
  if (storeId <= 0) {
    return Response.json({ error: "Invalid store id." }, { status: 400 });
  }

  try {
    const details = await getStoreDetails(getDb(), storeId);
    if (!details) {
      return Response.json({ error: "Store not found." }, { status: 404 });
    }
    return Response.json(details);
  } catch (error) {
    console.error(`/api/stores/${storeId} failed:`, error);
    return Response.json({ error: "Lookup failed." }, { status: 500 });
  }
}
