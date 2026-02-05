import WebSocket from "ws";
import { MarketDataManager } from "./marketDataManager";
import { CryptoTradeType } from "@prisma/client";

const BINANCE_SPOT_WS = "wss://stream.binance.com:9443/ws/!miniTicker@arr";
const BINANCE_FUTURES_WS = "wss://fstream.binance.com/ws/!miniTicker@arr";

export const BinanceMarketDataHandler = {
  async connect(segment: CryptoTradeType) {
    console.log("[BINANCE_MARKET_DATA] Connecting to WebSocket", {
      segment, // ✅ Log segment
    });

    // ✅ Use correct WebSocket URL based on segment
    const wsUrl = segment === "SPOT"
      ? "wss://stream.binance.com:9443/ws/!ticker@arr"
      : "wss://fstream.binance.com/ws/!ticker@arr";

    console.log("[BINANCE_MARKET_DATA] WebSocket URL", {
      segment,
      url: wsUrl, // ✅ Log URL
    });

    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log("[BINANCE_MARKET_DATA] WebSocket connected", {
        segment,
        url: wsUrl,
      });
      MarketDataManager.registerSocket("BINANCE", segment, ws);
    });

    ws.on("message", (data) => {
      try {
        const tickers = JSON.parse(data.toString());

        if (!Array.isArray(tickers)) {
          console.warn("[BINANCE_MARKET_DATA] Unexpected data format", {
            segment,
            dataType: typeof tickers,
          });
          return;
        }

        for (const ticker of tickers) {
          const symbol = ticker.s;
          const price = parseFloat(ticker.c);

          if (!price || price <= 0) continue;

          // ✅ Check if anyone is listening
          if (MarketDataManager.hasSubscribers("BINANCE", segment, symbol)) {
            MarketDataManager.updatePrice("BINANCE", segment, symbol, price);
          }
        }
      } catch (err) {
        console.error("[BINANCE_MARKET_DATA] Parse error", {
          segment,
          error: err,
        });
      }
    });

    ws.on("error", (error) => {
      console.error("[BINANCE_MARKET_DATA] WebSocket error", {
        segment,
        error,
      });
    });

    ws.on("close", (code, reason) => {
      console.log("[BINANCE_MARKET_DATA] WebSocket closed", {
        segment,
        code,
        reason: reason.toString(),
      });
    });
  },
};
