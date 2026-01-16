// marketBootstrap.ts
import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import prisma from "../../../config/db.config";
import { MarketDataManager } from "./marketDataManager";
import { startStrategyScheduler } from "../../../utils/scheduler/scheduler";

export async function bootstrapAll() {
  await bootstrapCryptoMarketData();
  // startStrategyScheduler();
}
export async function bootstrapCryptoMarketData() {
  const activeStrategies = await prisma.strategy.findMany({
    where: {
      status: "ACTIVE",
      assetType: "CRYPTO",
    },
  });

  for (const strategy of activeStrategies) {
    await MarketDataManager.subscribe(
      strategy.exchange as CryptoExchange,
      strategy.segment as CryptoTradeType,
      strategy.symbol,
      strategy.id
    );
  }

  console.log("MARKET_BOOTSTRAP_COMPLETED");
}
