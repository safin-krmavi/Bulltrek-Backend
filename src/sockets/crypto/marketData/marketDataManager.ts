import WebSocket from "ws";
import { marketDataRegistry } from "./marketDataRegistry";
import { BinanceMarketDataHandler } from "./binanceMarketDataHandler";
import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import { KuCoinMarketDataHandler } from "./kucoinMarketDataHandler";
import { CoinDCXFuturesHandler } from "./coindcxMarketDataHandler";
import { strategyRuntimeRegistry } from "../../../services/strategies/strategyRuntimeRegistry";

export const MarketDataManager = {
  /**
   * Ensure socket exists for exchange + segment
   */
  ensureConnection(exchange: string, segment: CryptoTradeType) {
    if (!marketDataRegistry[exchange]?.[segment]) {
      if (exchange === "BINANCE") {
        BinanceMarketDataHandler.connect(segment);
      } else if (exchange === "KUCOIN") {
        KuCoinMarketDataHandler.connect(segment);
      } else if (exchange === "COINDCX") {
        CoinDCXFuturesHandler.connect(); // use margin if you want dynamic
      }
    }
  },
  /**
   * Register socket (called once per segment)
   */
  registerSocket(
    exchange: CryptoExchange,
    segment: CryptoTradeType,
    socket: WebSocket
  ) {
    if (!marketDataRegistry[exchange]) {
      marketDataRegistry[exchange] = {};
    }

    marketDataRegistry[exchange][segment] = {
      socket,
      exchange,
      segment,
      symbols: new Set(),
      subscribers: new Map(),
    };

    console.log("MARKET_SOCKET_REGISTERED", { exchange, segment });
  },

  /**
   * Subscribe strategy to symbol
   */
  async subscribe(
    exchange: CryptoExchange,
    segment: CryptoTradeType,
    symbol: string,
    strategyId: string
  ) {
    await this.ensureConnection(exchange, segment);

    const connection = marketDataRegistry[exchange]?.[segment];
    if (!connection) return;

    connection.symbols.add(symbol);

    if (!connection.subscribers.has(symbol)) {
      connection.subscribers.set(symbol, new Set());
    }

    connection.subscribers.get(symbol)!.add(strategyId);

    console.log("MARKET_SUBSCRIBED", {
      exchange,
      segment,
      symbol,
      strategyId,
      count: connection.subscribers.get(symbol)!.size,
    });
  },
  /**
   * Unsubscribe
   */
  unsubscribe(
    exchange: string,
    segment: CryptoTradeType,
    symbol: string,
    strategyId: string
  ) {
    const connection = marketDataRegistry[exchange]?.[segment];
    if (!connection) return;

    const subs = connection.subscribers.get(symbol);
    if (!subs) return;

    subs.delete(strategyId);

    if (subs.size === 0) {
      connection.subscribers.delete(symbol);
      connection.symbols.delete(symbol);
    }

    console.log("MARKET_UNSUBSCRIBED", {
      exchange,
      segment,
      symbol,
      strategyId,
    });
  },

  /**
   * Called by socket handlers
   */
  updatePrice(
    exchange: string,
    segment: CryptoTradeType,
    symbol: string,
    price: number
  ) {
    const connection = marketDataRegistry[exchange]?.[segment];
    if (!connection) return;

    if (!connection.symbols.has(symbol)) return;

    const subscribers = connection.subscribers.get(symbol);
    if (!subscribers || subscribers.size === 0) return;
    console.log("[MARKET_TICK]", {
      exchange,
      segment,
      symbol,
      price,
      subscribers: subscribers.size,
    });
    const timestamp = Date.now();

    for (const strategyId of subscribers) {
      strategyRuntimeRegistry.onMarketTick({
        strategyId,
        price,
        timestamp,
      });
    }
  },

  /**
   * Debug
   */
  getActiveConnections() {
    const result: any[] = [];

    for (const exchange in marketDataRegistry) {
      for (const segment in marketDataRegistry[exchange]) {
        const conn = marketDataRegistry[exchange][segment as CryptoTradeType];
        if (!conn) continue;

        result.push({
          exchange,
          segment,
          symbols: conn.symbols.size,
        });
      }
    }

    return result;
  },
};
