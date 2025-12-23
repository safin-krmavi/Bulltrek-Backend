import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import prisma from "../../config/db.config";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { strategyRuntimeRegistry } from "./strategyRuntimeRegistry";

export const resubscribeAllStrategies = async () => {
  try {
    const strategies = await prisma.strategy.findMany({
      where: { status: "ACTIVE" },
    });

    for (const strategy of strategies) {
      // Ensure runtime is registered before subscribing
      strategyRuntimeRegistry.register(strategy);

      await MarketDataManager.subscribe(
        strategy.exchange as CryptoExchange,
        strategy.segment as CryptoTradeType,
        strategy.symbol,
        strategy.id
      );
    }

    console.log(
      `[MARKET] Resubscribed ${strategies.length} strategies on boot`
    );
  } catch (err) {
    console.error("[MARKET] Failed to resubscribe strategies:", err);
  }
};
