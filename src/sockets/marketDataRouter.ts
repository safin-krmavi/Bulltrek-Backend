// marketDataRouter.ts
import { MarketDataManager } from "../sockets/crypto/marketData/marketDataManager";
import { StocksExchange, CryptoExchange } from "@prisma/client";
import { StockMarketDataManager } from "./stocks/marketData/marketDataManager";

type SubscribeParams = {
  assetType: "CRYPTO" | "STOCK";
  exchange: CryptoExchange | StocksExchange;
  segment?: any; // For crypto: SPOT/FUTURES, for stocks can be undefined
  symbol: string;
  strategyId: string;
  userId: string;
};

export async function subscribeStrategyToMarketData(params: SubscribeParams) {
  const { assetType, exchange, segment, symbol, strategyId, userId } = params;
  console.log("STRATEGY : ", strategyId, assetType, exchange);

  if (assetType === "CRYPTO") {
    console.log("CRYPTO");
    return MarketDataManager.subscribe(
      exchange as CryptoExchange,
      segment,
      symbol,
      strategyId
    );
  }

  if (assetType === "STOCK") {
    console.log("STOCKS");

    // fetch credentials internally inside ensureConnection
    await StockMarketDataManager.ensureConnection(
      exchange as StocksExchange,
      userId
    );

    // Subscribe strategy
    return StockMarketDataManager.subscribe(
      exchange as StocksExchange,
      userId,
      symbol,
      strategyId
    );
  }

  throw new Error("Unsupported asset type");
}
