import { NextResponse } from "next/server";
import { getFullMapData } from "@/lib/map/get-map-data";

export async function GET() {
  try {
    const data = await getFullMapData();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load map data" },
      { status: 500 }
    );
  }
}
