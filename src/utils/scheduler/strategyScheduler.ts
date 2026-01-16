import prisma from "../../config/db.config";
import { strategyRuntimeRegistry } from "../../services/strategies/strategyRuntimeRegistry";
import { computeNextRunAt } from "./computeNextRunAt";

export async function runStrategyScheduler() {
  const strategies = await prisma.strategy.findMany({
    where: { status: "ACTIVE" },
  });


  strategies.forEach((strategy) => {
    const runtime = strategyRuntimeRegistry.getRuntime(strategy.id);
    if (!runtime) return;

    // Initialize nextRunAt if not present
    if (!runtime.state.nextRunAt) {
      const lastRun = runtime.state.lastExecutionAt
        ? new Date(runtime.state.lastExecutionAt)
        : new Date(0);

      runtime.state.nextRunAt = computeNextRunAt(
        (strategy.config as any).schedule,
        lastRun
      );

      console.log(`[SCHEDULER] Initialized nextRunAt for ${strategy.id}:`, {
        nextRunAt: runtime.state.nextRunAt,
        lastExecutionAt: runtime.state.lastExecutionAt,
      });
    }
  });
}
