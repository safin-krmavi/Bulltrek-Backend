import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import prisma from "../../config/db.config";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { strategyRuntimeRegistry } from "./strategyRuntimeRegistry";
import { subscribeStrategyToMarketData } from "../../sockets/marketDataRouter";

export const resubscribeAllStrategies = async () => {
  try {
    const strategies = await prisma.strategy.findMany({
      where: { status: "ACTIVE" },
    });

    for (const strategy of strategies) {
      // Ensure runtime is registered before subscribing
      strategyRuntimeRegistry.register(strategy);

      await subscribeStrategyToMarketData({
        assetType: strategy.assetType as any,
        exchange: strategy.exchange as any,
        segment: strategy.segment,
        symbol: strategy.symbol,
        strategyId: strategy.id,
        userId: strategy.userId,
      });
    }

    console.log(
      `[MARKET] Resubscribed ${strategies.length} strategies on boot`
    );
  } catch (err) {
    console.error("[MARKET] Failed to resubscribe strategies:", err);
  }
};

