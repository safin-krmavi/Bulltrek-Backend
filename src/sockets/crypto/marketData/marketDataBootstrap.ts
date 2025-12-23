import { Express } from "express";
import { MarketDataManager } from "./marketDataManager";

export function registerMarketDataManager(app: Express) {
  app.locals.marketData = {
    getActiveConnections: MarketDataManager.getActiveConnections,
  };

  console.log("MARKET_DATA_MANAGER_REGISTERED");

  process.on("SIGINT", () => {
    const connections = MarketDataManager.getActiveConnections();
    console.log("CLOSING_MARKET_DATA_SOCKETS", connections.length);
    process.exit();
  });
}
