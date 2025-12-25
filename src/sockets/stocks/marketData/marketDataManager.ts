// stockMarketDataManager.ts
import { stockMarketDataRegistry } from "./marketDataRegistry";
import { strategyRuntimeRegistry } from "../../../services/strategies/strategyRuntimeRegistry";
import { StocksExchange } from "@prisma/client";
import { ZerodhaMarketDataHandler } from "./zerodhaMarketDataHandler";
import { getStocksCredentials } from "../../../services/stocks/credentialsService";
import { KotakMarketDataHandler } from "./kotakMarketDataHandler";
// import { AngelOneMarketDataHandler } from "./angelOneMarketDataHandler"; // future exchanges

type StockConnection = {
  socket: any;
  symbols: Set<string>;
  subscribers: Map<string, Set<string>>;
};

export const StockMarketDataManager = {
  async ensureConnection(exchange: StocksExchange, userId: string) {
    if (!stockMarketDataRegistry[exchange]?.[userId]) {
      const rawCredentials = await getStocksCredentials(userId, exchange);

      const credentials = Array.isArray(rawCredentials)
        ? rawCredentials[0]
        : rawCredentials;

      if (!credentials) {
        throw new Error("Credentials not found");
      }
      // connect exchange-specific handler
      if (exchange === "ZERODHA") {
        ZerodhaMarketDataHandler.connect({
          userId,
          apiKey: credentials.apiKey,
          accessToken: credentials.accessToken!,
        });
      } else if (exchange === "KOTAK") {
        KotakMarketDataHandler.connect(userId, {
          tradingToken: credentials.accessToken,
          tradingSid: credentials.refreshToken,
          dataCenter: credentials.dataCenter,
        });
      }
      // else if (exchange === "ANGEL_ONE") AngelOneMarketDataHandler.connect({ userId, ...auth });
    }
  },

  registerSocket(exchange: StocksExchange, userId: string, socket: any) {
    if (!stockMarketDataRegistry[exchange])
      stockMarketDataRegistry[exchange] = {};
    stockMarketDataRegistry[exchange][userId] = {
      socket,
      symbols: new Set(),
      subscribers: new Map(),
    };
    console.log("STOCK_SOCKET_REGISTERED", { exchange, userId });
  },

  async subscribe(
    exchange: StocksExchange,
    userId: string,
    symbol: string,
    strategyId: string
  ) {
    const conn: StockConnection | undefined =
      stockMarketDataRegistry[exchange]?.[userId];
    if (!conn)
      throw new Error(
        `No socket connection for ${exchange} and user ${userId}`
      );

    conn.symbols.add(symbol);
    if (!conn.subscribers.has(symbol)) conn.subscribers.set(symbol, new Set());
    conn.subscribers.get(symbol)!.add(strategyId);

    console.log("STOCK_SUBSCRIBED", { exchange, userId, symbol, strategyId });
  },

  updatePrice(
    exchange: StocksExchange,
    userId: string,
    symbol: string,
    price: number
  ) {
    const conn: StockConnection | undefined =
      stockMarketDataRegistry[exchange]?.[userId];
    if (!conn || !conn.symbols.has(symbol)) return;

    const subscribers = conn.subscribers.get(symbol);
    if (!subscribers || subscribers.size === 0) return;

    const timestamp = Date.now();
    for (const strategyId of subscribers) {
      console.log("ON MARKET TICK");
      strategyRuntimeRegistry.onMarketTick({
        strategyId,

        price,
        timestamp,
      });
    }
  },

  disconnect(exchange: StocksExchange, userId: string) {
    const conn = stockMarketDataRegistry[exchange]?.[userId];
    conn?.socket?.disconnect();
    delete stockMarketDataRegistry[exchange][userId];
    console.log("STOCK_SOCKET_DISCONNECTED", { exchange, userId });
  },

  getActiveConnections() {
    const result: any[] = [];
    for (const exchange in stockMarketDataRegistry) {
      for (const userId in stockMarketDataRegistry[exchange]) {
        const conn = stockMarketDataRegistry[exchange][userId];
        result.push({ exchange, userId, symbols: conn.symbols.size });
      }
    }
    return result;
  },
};
