import { NextResponse } from "next/server";
import { getFullMapData } from "@/lib/map/get-map-data";

// Force Vercel to never serve this from edge cache
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getFullMapData();

    // Debug: log first location's coordinates to Vercel function logs
    const firstLoc = data.regions[0]?.locations[0];
    console.log("[/api/map] First location:", JSON.stringify(firstLoc));

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[/api/map] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load map data" },
      { status: 500 }
    );
  }
}