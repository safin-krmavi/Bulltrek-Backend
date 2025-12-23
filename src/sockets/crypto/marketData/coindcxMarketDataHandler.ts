import { io, Socket } from "socket.io-client";
import { MarketDataManager } from "./marketDataManager";
import { CryptoTradeType } from "@prisma/client";
import { getCoindcxFuturesSymbols } from "../../../services/crypto/exchange/coindcxService";

const COINDCX_WS = "wss://stream.coindcx.com";

interface CoinDCXFuturesMsg {
  data?: any[];
  pr?: string;
}

export const CoinDCXFuturesHandler = {
  sockets: new Map<string, Socket>(),

  async connect(margin: "USDT" | "INR" = "USDT") {
    try {
      const symbols = await getCoindcxFuturesSymbols(margin);

      if (!symbols || symbols.length === 0) {
        console.warn("No active CoinDCX futures symbols found.");
        return;
      }

      const socket = io(COINDCX_WS, { transports: ["websocket"] });

      socket.on("connect", () => {
        console.log("COINDCX_FUTURES_SOCKET_OPEN");
        symbols.forEach((symbol) => this.subscribeSymbol(symbol, socket));
      });

      socket.on("price-change", (msg: CoinDCXFuturesMsg) => {
        msg.data?.forEach((tick: any) => {
          if (tick.pr !== "futures") return;
          const symbol = tick.symbol;
          const price = parseFloat(tick.p || tick.close);
          if (symbol && !isNaN(price)) {
            MarketDataManager.updatePrice("COINDCX", CryptoTradeType.FUTURES, symbol, price);
          }
        });
      });

      socket.on("new-trade", (msg: CoinDCXFuturesMsg) => {
        msg.data?.forEach((trade: any) => {
          if (trade.pr !== "futures") return;
          const symbol = trade.s;
          const price = parseFloat(trade.p);
          if (symbol && !isNaN(price)) {
            MarketDataManager.updatePrice("COINDCX", CryptoTradeType.FUTURES, symbol, price);
          }
        });
      });

      socket.on("candlestick", (msg: CoinDCXFuturesMsg) => {
        msg.data?.forEach((candle: any) => {
          console.log("CANDLE", candle.symbol, candle.duration, candle.open, candle.close);
        });
      });

      socket.on("depth-snapshot", (msg: any) => console.log("DEPTH", msg));

      socket.on("disconnect", () => console.log("COINDCX_FUTURES_SOCKET_CLOSED"));
      socket.on("error", (err) => console.log("COINDCX_FUTURES_SOCKET_ERROR", err));

      MarketDataManager.registerSocket("COINDCX", CryptoTradeType.FUTURES, socket);
      this.sockets.set("futures", socket);
    } catch (err) {
      console.error("COINDCX_FUTURES_HANDLER_ERROR", err);
    }
  },

  subscribeSymbol(symbol: string, socket: Socket) {
    socket.emit("join", { channelName: `B-${symbol}@prices-futures` });
    socket.emit("join", { channelName: `B-${symbol}@trades-futures` });
    socket.emit("join", { channelName: `B-${symbol}_1h-futures` });
  },

  resubscribeAll() {
    const socket = this.sockets.get("futures");
    if (!socket) return;

    const conn = MarketDataManager.getActiveConnections().find(
      (c) => c.exchange === "COINDCX" && c.segment === CryptoTradeType.FUTURES
    );
    conn?.symbols.forEach((symbol: string) => this.subscribeSymbol(symbol, socket));
  },
};
