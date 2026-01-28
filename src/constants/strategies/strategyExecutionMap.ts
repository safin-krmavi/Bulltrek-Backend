import { EXECUTION_MODES, ExecutionMode } from "./executionModes";

export const STRATEGY_EXECUTION_MAP: Record<string, ExecutionMode> = {
  // Time-based strategies
  GROWTH_DCA: EXECUTION_MODES.TIME_BASED,
  HUMAN_GRID: EXECUTION_MODES.SIGNAL_BASED,
  SMART_GRID: EXECUTION_MODES.SIGNAL_BASED,
  //   FIXED_DCA: EXECUTION_MODES.TIME_BASED,
  //   REBALANCING: EXECUTION_MODES.TIME_BASED,

  //   // Signal-based strategies
  //   UT_BOT: EXECUTION_MODES.SIGNAL_BASED,
  //   RSI: EXECUTION_MODES.SIGNAL_BASED,
  //   MACD: EXECUTION_MODES.SIGNAL_BASED,
  //   GRID: EXECUTION_MODES.SIGNAL_BASED,
};

export function resolveExecutionMode(strategyType: string) {
  return STRATEGY_EXECUTION_MAP[strategyType];
}
