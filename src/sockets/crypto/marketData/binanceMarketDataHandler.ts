import WebSocket from "ws";
import { MarketDataManager } from "./marketDataManager";
import { CryptoTradeType } from "@prisma/client";

const BINANCE_SPOT_WS = "wss://stream.binance.com:9443/ws/!miniTicker@arr";
const BINANCE_FUTURES_WS = "wss://fstream.binance.com/ws/!miniTicker@arr";

export const BinanceMarketDataHandler = {
  connect(segment: CryptoTradeType) {
    const url =
      segment === CryptoTradeType.SPOT ? BINANCE_SPOT_WS : BINANCE_FUTURES_WS;

    const ws = new WebSocket(url);

    ws.on("open", () => {
      console.log("BINANCE_SOCKET_OPEN", { segment });
    });

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        for (const tick of data) {
          const symbol = tick.s;
          const ltp = parseFloat(tick.c);
          if (!ltp) continue;

          MarketDataManager.updatePrice("BINANCE", segment, symbol, ltp);
        }
      } catch (err) {
        console.log("BINANCE_SOCKET_PARSE_ERROR", segment, err);
      }
    });

    ws.on("close", () => {
      console.log("BINANCE_SOCKET_CLOSED", { segment });
    });

    ws.on("error", (err) => {
      console.log("BINANCE_SOCKET_ERROR", { segment, err });
    });

    MarketDataManager.registerSocket("BINANCE", segment, ws);
  },
};
