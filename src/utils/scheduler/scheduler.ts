import { strategyRuntimeRegistry } from "../../services/strategies/strategyRuntimeRegistry";
import { isStrategyDue } from "../../utils/strategySchedule";

export function startStrategyScheduler() {
  console.log("[SCHEDULER] Started");

  setInterval(async () => {
    const now = Date.now();

    strategyRuntimeRegistry.getAllRuntimes().forEach(async (runtime) => {
      const schedule = (runtime as any).strategy.config.schedule;
      if (!schedule) return;

      if (isStrategyDue(schedule, runtime.state.lastExecutionAt, now)) {
        console.log(`[SCHEDULER] Triggering strategy ${runtime.state.status}`);
        const lastPrice = 0; // optionally fetch last known price from market
        await runtime.executeScheduled(lastPrice);
      }
    });
  }, 10 * 1000); // check every 10s
}
