import { strategyRuntimeRegistry } from "../../services/strategies/strategyRuntimeRegistry";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { StockMarketDataManager } from "../../sockets/stocks/marketData/marketDataManager";
import { isStrategyDue } from "../../utils/strategySchedule";

export function startStrategyScheduler() {
  console.log("[SCHEDULER] Started - Monitoring SIGNAL_BASED strategies only");

  setInterval(async () => {
    const now = Date.now();

    // ✅ ONLY handle SIGNAL_BASED strategies (Human Grid, Smart Grid)
    // Growth DCA is handled by AWS Lambda
    strategyRuntimeRegistry.getAllRuntimes().forEach(async (runtime) => {
      const strategy = (runtime as any).strategy;
      
      // ✅ Skip Growth DCA entirely
      if (strategy.type === "GROWTH_DCA") {
        return;
      }

      const schedule = strategy.config?.schedule;
      if (!schedule) return;
      if (!isStrategyDue(schedule, runtime.state.lastExecutionAt, now)) return;

      console.log(`[SCHEDULER] Triggering SIGNAL_BASED strategy ${strategy.id}`);

      let lastPrice: number | null = null;

      if (strategy.assetType === "CRYPTO") {
        lastPrice = MarketDataManager.getLastPrice(
          strategy.exchange,
          strategy.segment,
          strategy.symbol
        );

        if (!lastPrice || lastPrice <= 0) {
          lastPrice = await MarketDataManager.fetchMarketPrice(
            strategy.exchange,
            strategy.segment,
            strategy.symbol
          );
        }
      }

      if (strategy.assetType === "STOCK") {
        lastPrice = StockMarketDataManager.getLastPrice(
          strategy.exchange,
          strategy.userId,
          strategy.symbol
        );

        if (!lastPrice || lastPrice <= 0) {
          lastPrice = await StockMarketDataManager.fetchMarketPrice(
            strategy.exchange,
            strategy.userId,
            strategy.symbol,
          );
        }
      }

      if (!lastPrice || lastPrice <= 0) {
        console.log("[SCHEDULER] No market price available for", strategy.symbol);
        return;
      }

      await runtime.executeScheduled(lastPrice);
    });

    // ❌ REMOVED: No longer poll DB for Growth DCA
    // AWS Lambda handles all Growth DCA executions

  }, 5 * 1000); // Check every 5s for signal-based strategies only
}