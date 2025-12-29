import { isStrategyDue } from "../../utils/strategySchedule";
import prisma from "../../config/db.config";
import { strategyRuntimeRegistry } from "../../services/strategies/strategyRuntimeRegistry";

export async function runStrategyScheduler() {
  const now = Date.now();

  const strategies = await prisma.strategy.findMany({
    where: { status: "ACTIVE" },
  });

  strategies.forEach((strategy) => {
    const runtime = strategyRuntimeRegistry.getRuntime(strategy.id);
    if (!runtime) return;

    const lastExecution = runtime.state.lastExecutionAt || null;

    const due = isStrategyDue((strategy.config as any).schedule, lastExecution, now);

    runtime.active = due;

    if (due) {
      console.log(`[SCHEDULER] Activating strategy ${strategy.id}`);
    }
  });
}
