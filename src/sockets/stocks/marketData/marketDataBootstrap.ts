// marketBootstrap.ts
import { StocksExchange } from "@prisma/client";
import prisma from "../../../config/db.config";
import { StockMarketDataManager } from "./marketDataManager";

export async function bootstrapMarketData() {
  const activeStrategies = await prisma.strategy.findMany({
    where: {
      status: "ACTIVE",
      assetType: "STOCK",
    },
  });

  for (const strategy of activeStrategies) {
    await StockMarketDataManager.subscribe(
      strategy.exchange as StocksExchange,
      strategy.segment,
      strategy.symbol,
      strategy.id
    );
  }

  console.log("MARKET_BOOTSTRAP_COMPLETED");
}
