import { getStrategyById } from "../services/strategyService";
import { timeEngine } from "./engines/timeEngine";
import { signalEngine } from "./engines/signalEngine";
import { exitMonitor } from "./monitors/exitMonitor";
import { STRATEGY_EXECUTION_MAP } from "../constants/strategies/strategyExecutionMap";
import { EXECUTION_MODES } from "../constants/strategies/executionModes";
import prisma from "../config/db.config";
import { computeNextRunAt } from "../utils/scheduler/computeNextRunAt";

export async function registerStrategy(strategyId: string) {
  const strategy = await getStrategyById(strategyId);
  if (!strategy || strategy.status !== "ACTIVE") return;

  const executionMode = STRATEGY_EXECUTION_MAP[strategy.type];
  if (!executionMode) {
    throw new Error(`No execution mode for strategy type: ${strategy.type}`);
  }

  if (executionMode === EXECUTION_MODES.TIME_BASED) {
    const nextRunAt = computeNextRunAt((strategy.config as any).schedule);

    await prisma.strategy.update({
      where: { id: strategy.id },
      data: { nextRunAt },
    });

    timeEngine.register({
      ...strategy,
      nextRunAt,
    });
  }

  if (executionMode === EXECUTION_MODES.SIGNAL_BASED) {
    signalEngine.register(strategy);
  }

  exitMonitor.register(strategy);
  console.log("[STRATEGY_REGISTER_COMPLETE]", { strategyId });
}

export function unregisterStrategy(strategyId: string) {
  console.log("[STRATEGY_REGISTER_COMPLETE]", { strategyId });
  timeEngine.unregister(strategyId);
  signalEngine.unregister(strategyId);
  exitMonitor.unregister(strategyId);
}
