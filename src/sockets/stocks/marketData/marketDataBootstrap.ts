import { Express } from "express";
import { StockMarketDataManager } from "./marketDataManager";

export function registerMarketDataManager(app: Express) {
  app.locals.marketData = {
    getActiveConnections: StockMarketDataManager.getActiveConnections,
  };

  console.log("MARKET_DATA_MANAGER_REGISTERED");

  process.on("SIGINT", () => {
    const connections = StockMarketDataManager.getActiveConnections();
    console.log("CLOSING_MARKET_DATA_SOCKETS", connections.length);
    process.exit();
  });
}
