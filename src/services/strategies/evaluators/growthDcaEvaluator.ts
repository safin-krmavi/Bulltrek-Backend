// services/strategies/evaluators/growthDcaEvaluator.ts
import { Strategy } from "@prisma/client";

export function evaluateGrowthDCA(
  strategy: Strategy,
  state: any,
  price: number,
  timestamp: number
): "BUY" | null {
  const config = strategy.config as any;

  console.log("[GROWTH_DCA_EVALUATE] Tick", {
    strategyId: strategy.id,
    price,
    timestamp,
    investedCapital: state.investedCapital,
    lastExecutionAt: state.lastExecutionAt,
    lastBuyPrice: state.lastBuyPrice,
    dcaIndex: state.dcaIndex,
    maxOrders: config.dca?.maxOrders,
  });

  // 1️⃣ Max DCA steps reached
  if (state.dcaIndex >= config.dca?.maxOrders) {
    console.log("[GROWTH_DCA_EVALUATE] Max DCA steps reached");
    return null;
  }

  // 3️⃣ Capital check
  const nextCapital = state.investedCapital + config.capital?.perOrderAmount;
  if (nextCapital > config.capital?.maxCapital) {
    console.log("[GROWTH_DCA_EVALUATE] Skipping due to capital limit", {
      nextCapital,
      maxCapital: config.capital?.maxCapital,
    });
    return null;
  }

  // 4️⃣ Price drop condition (skip for first order)
  if (state.lastBuyPrice) {
    const dropPercent =
      ((state.lastBuyPrice - price) / state.lastBuyPrice) * 100;
    if (dropPercent < config.dca?.priceDropPercent) {
      console.log(
        "[GROWTH_DCA_EVALUATE] Skipping due to price not dropped enough",
        {
          lastBuyPrice: state.lastBuyPrice,
          currentPrice: price,
          dropPercent,
          requiredDrop: config.dca?.priceDropPercent,
        }
      );
      return null;
    }
  }

  console.log("[GROWTH_DCA_EVALUATE] Decision: BUY");
  return "BUY";
}
