import WebSocket from "ws";
import { marketDataRegistry } from "./marketDataRegistry";
import { BinanceMarketDataHandler } from "./binanceMarketDataHandler";
import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import { KuCoinMarketDataHandler } from "./kucoinMarketDataHandler";
import { strategyRuntimeRegistry } from "../../../services/strategies/strategyRuntimeRegistry";
import { CoinDCXHandler } from "./coindcxMarketDataHandler";
import { fetchBinanceMarketPrice } from "../../../services/crypto/exchange/binanceService";
import { fetchKucoinMarketPrice } from "../../../services/crypto/exchange/kucoinService";
import { fetchCoinDCXMarketPrice } from "../../../services/crypto/exchange/coindcxService";
import { signalEngine } from "../../../strategies/engines/signalEngine";
import { exitMonitor } from "../../../strategies/monitors/exitMonitor";
const cryptoLastPrices: {
  [exchange: string]: {
    [segment: string]: {
      [symbol: string]: number;
    };
  };
} = {};

export const MarketDataManager = {
  /**
   * Ensure socket exists for exchange + segment
   */
  ensureConnection(exchange: CryptoExchange, segment: CryptoTradeType) {
    if (!marketDataRegistry[exchange]) {
      marketDataRegistry[exchange] = {};
    }

    if (!marketDataRegistry[exchange][segment]) {
      // 🔥 CREATE EMPTY CONNECTION FIRST
      marketDataRegistry[exchange][segment] = {
        socket: null,
        exchange,
        segment,
        symbols: new Set(),
        subscribers: new Map(),
      };

      // Then connect async
      if (exchange === "BINANCE") {
        BinanceMarketDataHandler.connect(segment);
      } else if (exchange === "KUCOIN") {
        KuCoinMarketDataHandler.connect(segment);
      } else if (exchange === "COINDCX") {
        CoinDCXHandler.connect(segment);
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
    const connection = marketDataRegistry[exchange]?.[segment];

    if (!connection) {
      // safety fallback (rare)
      marketDataRegistry[exchange] ??= {};
      marketDataRegistry[exchange][segment] = {
        socket,
        exchange,
        segment,
        symbols: new Set(),
        subscribers: new Map(),
      };
    } else {
      connection.socket = socket;
    }

    console.log("MARKET_SOCKET_ATTACHED", { exchange, segment });
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
    console.log("EXCHANGE ", exchange);

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

    // console.log("CHECK THIS", marketDataRegistry);
  },

  hasSubscribers(
    exchange: string,
    segment: CryptoTradeType,
    symbol: string
  ): boolean {
    const connection = marketDataRegistry[exchange]?.[segment];
    if (!connection) return false;

    return connection.symbols.has(symbol);
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
    cryptoLastPrices[exchange] ??= {};
    cryptoLastPrices[exchange][segment] ??= {};
    cryptoLastPrices[exchange][segment][symbol] = price;

    const connection = marketDataRegistry[exchange]?.[segment];
    if (!connection) return;

    if (!connection.symbols.has(symbol)) return;
    // console.log("HERE");
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
      // console.log("STRATEGY", strategyId);
      signalEngine.onMarketTick(
        strategyId,
        price,
        timestamp,
      );
      exitMonitor.evaluate(strategyId, price);

    }
  },

  getLastPrice(
    exchange: string,
    segment: CryptoTradeType,
    symbol: string
  ): number | null {
    return cryptoLastPrices[exchange]?.[segment]?.[symbol] ?? null;
  },
  async fetchMarketPrice(
    exchange: CryptoExchange,
    segment: CryptoTradeType,
    symbol: string
  ): Promise<number | null> {
    // First check cache
    const cached = this.getLastPrice(exchange, segment, symbol);
    if (cached) return cached;

    // 🔥 Fallback: fetch from API if no cached tick
    try {
      if (exchange === "BINANCE") {
        return await fetchBinanceMarketPrice({ symbol, assetType: segment });
      } else if (exchange === "KUCOIN") {
        return await fetchKucoinMarketPrice({ symbol, assetType: segment });
      } else if (exchange === "COINDCX") {
        return await fetchCoinDCXMarketPrice({ symbol, assetType: segment });
      }
    } catch (err) {
      console.error("[CRYPTO_FETCH_PRICE_ERROR]", {
        exchange,
        segment,
        symbol,
        err,
      });
      return null;
    }

    return null;
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
