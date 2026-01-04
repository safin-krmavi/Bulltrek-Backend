import { strategyRuntimeRegistry } from "../../services/strategies/strategyRuntimeRegistry";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { StockMarketDataManager } from "../../sockets/stocks/marketData/marketDataManager";
import { isStrategyDue } from "../../utils/strategySchedule";

export function startStrategyScheduler() {
  console.log("[SCHEDULER] Started");

  setInterval(async () => {
    const now = Date.now();

    strategyRuntimeRegistry.getAllRuntimes().forEach(async (runtime) => {
      const strategy = (runtime as any).strategy;
      const schedule = strategy.config?.schedule;
      if (!schedule) return;
      if (!isStrategyDue(schedule, runtime.state.lastExecutionAt, now)) return;

      console.log(`[SCHEDULER] Triggering strategy ${runtime.state.status}`);

      let lastPrice: number | null = null;

      if (strategy.assetType === "CRYPTO") {
        lastPrice = MarketDataManager.getLastPrice(
          strategy.exchange,
          strategy.segment,
          strategy.symbol
        );

        if (!lastPrice || lastPrice <= 0) {
          // fallback to fetching current market price
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
          // fallback to fetching current market price
          lastPrice = await StockMarketDataManager.fetchMarketPrice(
            strategy.exchange,
            strategy.userId,
            strategy.symbol,
            
          );
        }
      }

      // skip if still no price
      if (!lastPrice || lastPrice <= 0) {
        console.log("No market price available for", strategy.symbol);
        return;
      }

      await runtime.executeScheduled(lastPrice);
    });
  }, 10 * 1000); // check every 10s
}
