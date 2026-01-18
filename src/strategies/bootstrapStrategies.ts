import prisma from "../config/db.config";
import { registerStrategy } from "./dispatcher";

export async function bootstrapStrategies() {
  const strategies = await prisma.strategy.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  for (const s of strategies) {
    await registerStrategy(s.id);
  }

  console.log(`[BOOTSTRAP] Registered ${strategies.length} strategies`);
}
