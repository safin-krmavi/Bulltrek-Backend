import prisma from "../../config/db.config";
import { strategyRuntimeRegistry } from "../../services/strategies/strategyRuntimeRegistry";
import { computeNextRunAt } from "./computeNextRunAt";

export async function runStrategyScheduler() {
  const strategies = await prisma.strategy.findMany({
    where: { 
      status: "ACTIVE",
      type: "GROWTH_DCA" // ✅ Only schedule time-based strategies
    },
  });

  strategies.forEach((strategy) => {
    const runtime = strategyRuntimeRegistry.getRuntime(strategy.id);
    if (!runtime) return;

    // ✅ Type guard: Only Growth DCA has nextRunAt
    if (strategy.type === "GROWTH_DCA") {
      const state = runtime.state as any; // Cast to access nextRunAt

      if (!state.nextRunAt) {
        const lastRun = state.lastExecutionAt
          ? new Date(state.lastExecutionAt)
          : new Date(0);

        state.nextRunAt = computeNextRunAt(
          (strategy.config as any).schedule,
          lastRun
        );

        console.log(`[SCHEDULER] Initialized nextRunAt for ${strategy.id}:`, {
          nextRunAt: state.nextRunAt,
          lastExecutionAt: state.lastExecutionAt,
        });
      }
    }
  });
}