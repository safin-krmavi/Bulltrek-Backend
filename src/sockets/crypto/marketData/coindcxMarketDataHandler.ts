import { io, Socket } from "socket.io-client";
import { MarketDataManager } from "./marketDataManager";
import { CryptoTradeType } from "@prisma/client";
import {
  // getCoindcxSpotSymbols,
  getCoindcxFuturesSymbols,
} from "../../../services/crypto/exchange/coindcxService";

const COINDCX_WS = "wss://stream.coindcx.com";

interface CoinDCXMsg {
  data?: any[];
  pr?: string;
}

type Segment = "SPOT" | "FUTURES";

export const CoinDCXHandler = {
  sockets: new Map<Segment, Socket>(),

  async connect(segment: Segment, margin: "USDT" | "INR" = "USDT") {
    try {
      let symbols: string[] = [];
      if (segment === "SPOT") {
        // symbols = await getCoindcxSpotSymbols();
      } else if (segment === "FUTURES") {
        symbols = await getCoindcxFuturesSymbols(margin);
      }

      if (!symbols || symbols.length === 0) {
        console.warn(`No active CoinDCX ${segment.toLowerCase()} symbols found.`);
        return;
      }

      const socket = io(COINDCX_WS, { transports: ["websocket"] });

      socket.on("connect", () => {
        console.log(`COINDCX_${segment}_SOCKET_OPEN`);
        symbols.forEach((symbol) => this.subscribeSymbol(symbol, socket, segment));
      });

      socket.on("price-change", (msg: CoinDCXMsg) => {
        msg.data?.forEach((tick: any) => {
          if (tick.pr?.toLowerCase() !== segment.toLowerCase()) return;
          const symbol = tick.symbol;
          const price = parseFloat(tick.p || tick.close);
          if (symbol && !isNaN(price)) {
            MarketDataManager.updatePrice("COINDCX", segment as CryptoTradeType, symbol, price);
          }
        });
      });

      socket.on("new-trade", (msg: CoinDCXMsg) => {
        msg.data?.forEach((trade: any) => {
          if (trade.pr?.toLowerCase() !== segment.toLowerCase()) return;
          const symbol = trade.s;
          const price = parseFloat(trade.p);
          if (symbol && !isNaN(price)) {
            MarketDataManager.updatePrice("COINDCX", segment as CryptoTradeType, symbol, price);
          }
        });
      });

      socket.on("candlestick", (msg: CoinDCXMsg) => {
        msg.data?.forEach((candle: any) => {
          console.log(
            `CANDLE_${segment}`,
            candle.symbol,
            candle.duration,
            candle.open,
            candle.close
          );
        });
      });

      socket.on("depth-snapshot", (msg: any) => console.log(`DEPTH_${segment}`, msg));
      socket.on("disconnect", () => console.log(`COINDCX_${segment}_SOCKET_CLOSED`));
      socket.on("error", (err) => console.log(`COINDCX_${segment}_SOCKET_ERROR`, err));

      MarketDataManager.registerSocket("COINDCX", segment as CryptoTradeType, socket);
      this.sockets.set(segment, socket);
    } catch (err) {
      console.error(`COINDCX_${segment}_HANDLER_ERROR`, err);
    }
  },

  subscribeSymbol(symbol: string, socket: Socket, segment: Segment) {
    const suffix = segment === "FUTURES" ? "-futures" : "";
    const candlestickSuffix = segment === "FUTURES" ? "_1h-futures" : "_1h";

    socket.emit("join", { channelName: `B-${symbol}@prices${suffix}` });
    socket.emit("join", { channelName: `B-${symbol}@trades${suffix}` });
    socket.emit("join", { channelName: `B-${symbol}${candlestickSuffix}` });
  },

  resubscribeAll(segment: Segment) {
    const socket = this.sockets.get(segment);
    if (!socket) return;

    const conn = MarketDataManager.getActiveConnections().find(
      (c) => c.exchange === "COINDCX" && c.segment === segment
    );
    conn?.symbols.forEach((symbol: string) => this.subscribeSymbol(symbol, socket, segment));
  },
};
