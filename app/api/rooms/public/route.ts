import { NextResponse } from "next/server";
import { listPublicRooms } from "@/lib/lobby/list-public-rooms";

export async function GET() {
  const result = await listPublicRooms();
  return NextResponse.json(result, { status: 200 });
}
