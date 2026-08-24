import "dotenv/config";
import { prisma } from "../lib/prisma";

const roomId = process.argv[2];
if (!roomId) {
  console.error("Usage: npx tsx prisma/terminate-game.ts <roomId-or-code>");
  process.exit(1);
}

async function terminateGame() {
  // Find room by ID or code
  const room = await prisma.room.findFirst({
    where: {
      OR: [{ id: roomId }, { code: roomId }],
    },
  });

  if (!room) {
    console.error(`Room not found: ${roomId}`);
    process.exit(1);
  }

  console.log(`Found room: ${room.id} (code: ${room.code}, status: ${room.status})`);

  // Update status to abandoned
  await prisma.room.update({
    where: { id: room.id },
    data: { status: "abandoned" },
  });

  console.log(`Room ${room.code} terminated (status -> abandoned)`);
  await prisma.$disconnect();
}

terminateGame().catch((err) => {
  console.error(err);
  process.exit(1);
});