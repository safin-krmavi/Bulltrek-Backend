import { isStrategyDue } from "../../utils/strategySchedule";
import prisma from "../../config/db.config";
import { strategyRuntimeRegistry } from "../../services/strategies/strategyRuntimeRegistry";

export async function runStrategyScheduler() {
  console.log("[SCHEDULER] Running strategy scheduler");

  const now = Date.now();

  const strategies = await prisma.strategy.findMany({
    where: { status: "ACTIVE" },
  });

  strategies.forEach((strategy) => {
    const runtime = strategyRuntimeRegistry.getRuntime(strategy.id);
    if (!runtime) return;

    const lastExecution = runtime.state.lastExecutionAt || null;

    if (isStrategyDue((strategy.config as any).schedule, lastExecution, now)) {
      console.log(`[SCHEDULER] Activating strategy ${strategy.id}`);
      runtime.active = true;
    } else {
      runtime.active = false;
    }
  });
}
