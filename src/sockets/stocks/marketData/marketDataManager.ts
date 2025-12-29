import { stockMarketDataRegistry } from "./marketDataRegistry";
import { strategyRuntimeRegistry } from "../../../services/strategies/strategyRuntimeRegistry";
import { StocksExchange } from "@prisma/client";
import { ZerodhaMarketDataHandler } from "./zerodhaMarketDataHandler";
import { getStocksCredentials } from "../../../services/stocks/credentialsService";
import { KotakMarketDataHandler } from "./kotakMarketDataHandler";

export const StockMarketDataManager = {
  /**
   * Ensure connection exists for exchange + userId
   * Creates placeholder first, then connects async
   */
  async ensureConnection(exchange: StocksExchange, userId: string) {
    // 🔥 CREATE EMPTY CONNECTION FIRST (prevents race conditions)
    if (!stockMarketDataRegistry[exchange]) {
      stockMarketDataRegistry[exchange] = {};
    }

    if (!stockMarketDataRegistry[exchange][userId]) {
      // Initialize empty connection immediately
      stockMarketDataRegistry[exchange][userId] = {
        socket: null,
        // exchange,
        // userId,
        symbols: new Set(),
        subscribers: new Map(),
      };

      console.log("[STOCK_CONNECTION_INIT]", { exchange, userId });

      // Then connect async
      try {
        const rawCredentials = await getStocksCredentials(userId, exchange);
        const credentials = Array.isArray(rawCredentials)
          ? rawCredentials[0]
          : rawCredentials;

        if (!credentials) {
          console.error("[STOCK_CONNECTION_ERROR] Credentials not found", {
            exchange,
            userId,
          });
          throw new Error(
            `No credentials found for ${exchange} and user ${userId}`
          );
        }

        // Connect exchange-specific handler
        if (exchange === "ZERODHA") {
          await ZerodhaMarketDataHandler.connect({
            userId,
            apiKey: credentials.apiKey,
            accessToken: credentials.accessToken!,
          });
        } else if (exchange === "KOTAK") {
          await KotakMarketDataHandler.connect(userId, {
            tradingToken: credentials.accessToken,
            tradingSid: credentials.refreshToken,
            dataCenter: credentials.dataCenter,
          });
        }
        // else if (exchange === "ANGEL_ONE") {
        //   await AngelOneMarketDataHandler.connect({ userId, ...credentials });
        // }

        console.log("[STOCK_CONNECTION_SUCCESS]", { exchange, userId });
      } catch (error) {
        console.error("[STOCK_CONNECTION_FAILED]", {
          exchange,
          userId,
          error: error instanceof Error ? error.message : error,
        });
        // Clean up failed connection
        delete stockMarketDataRegistry[exchange][userId];
        throw error;
      }
    }
  },

  /**
   * Register socket instance (called by exchange handlers)
   */
  registerSocket(exchange: StocksExchange, userId: string, socket: any) {
    const connection = stockMarketDataRegistry[exchange]?.[userId];

    if (!connection) {
      // Safety fallback (rare case)
      if (!stockMarketDataRegistry[exchange]) {
        stockMarketDataRegistry[exchange] = {};
      }
      stockMarketDataRegistry[exchange][userId] = {
        socket,
        // exchange,
        // userId,
        symbols: new Set(),
        subscribers: new Map(),
      };
    } else {
      // Update existing connection with socket
      connection.socket = socket;
    }

    console.log("[STOCK_SOCKET_REGISTERED]", { exchange, userId });
  },

  /**
   * Subscribe strategy to a symbol
   */
  async subscribe(
    exchange: StocksExchange,
    userId: string,
    symbol: string,
    strategyId: string
  ) {
    // Ensure connection exists
    await this.ensureConnection(exchange, userId);

    const conn = stockMarketDataRegistry[exchange]?.[userId];
    if (!conn) {
      throw new Error(
        `Failed to establish connection for ${exchange} and user ${userId}`
      );
    }

    // Add symbol and subscriber
    conn.symbols.add(symbol);
    if (!conn.subscribers.has(symbol)) {
      conn.subscribers.set(symbol, new Set());
    }
    conn.subscribers.get(symbol)!.add(strategyId);

    console.log("[STOCK_SUBSCRIBED]", {
      exchange,
      userId,
      symbol,
      strategyId,
      subscriberCount: conn.subscribers.get(symbol)!.size,
    });
  },

  /**
   * Check if there are active subscribers for a symbol
   */
  hasSubscribers(
    exchange: StocksExchange,
    userId: string,
    symbol: string
  ): boolean {
    const conn = stockMarketDataRegistry[exchange]?.[userId];
    if (!conn) return false;
    return conn.symbols.has(symbol);
  },

  /**
   * Unsubscribe strategy from a symbol
   */
  unsubscribe(
    exchange: StocksExchange,
    userId: string,
    symbol: string,
    strategyId: string
  ) {
    const conn = stockMarketDataRegistry[exchange]?.[userId];
    if (!conn) return;

    const subs = conn.subscribers.get(symbol);
    if (!subs) return;

    subs.delete(strategyId);

    // Clean up empty subscribers
    if (subs.size === 0) {
      conn.subscribers.delete(symbol);
      conn.symbols.delete(symbol);
    }

    console.log("[STOCK_UNSUBSCRIBED]", {
      exchange,
      userId,
      symbol,
      strategyId,
      remainingSubscribers: subs.size,
    });
  },

  /**
   * Update price and notify all subscribers
   * Called by exchange-specific handlers (Zerodha, Kotak, etc.)
   */
  updatePrice(
    exchange: StocksExchange,
    userId: string,
    symbol: string,
    price: number
  ) {
    const conn = stockMarketDataRegistry[exchange]?.[userId];
    if (!conn) {
      console.warn("[STOCK_PRICE_UPDATE_SKIPPED] No connection", {
        exchange,
        userId,
        symbol,
      });
      return;
    }

    if (!conn.symbols.has(symbol)) {
      console.warn("[STOCK_PRICE_UPDATE_SKIPPED] Symbol not tracked", {
        exchange,
        userId,
        symbol,
      });
      return;
    }

    const subscribers = conn.subscribers.get(symbol);
    if (!subscribers || subscribers.size === 0) {
      console.warn("[STOCK_PRICE_UPDATE_SKIPPED] No subscribers", {
        exchange,
        userId,
        symbol,
      });
      return;
    }

    const timestamp = Date.now();

    // Log price update with details
    console.log("[STOCK_MARKET_TICK]", {
      exchange,
      userId,
      symbol,
      price,
      subscribers: subscribers.size,
      time: new Date(timestamp).toISOString(),
    });

    // Notify all subscribed strategies
    for (const strategyId of subscribers) {
      strategyRuntimeRegistry.onMarketTick({
        strategyId,
        price,
        timestamp,
      });
    }
  },

  /**
   * Disconnect and cleanup for a user
   */
  disconnect(exchange: StocksExchange, userId: string) {
    const conn = stockMarketDataRegistry[exchange]?.[userId];
    if (!conn) {
      console.warn("[STOCK_DISCONNECT_SKIPPED] Connection not found", {
        exchange,
        userId,
      });
      return;
    }

    // Disconnect socket if exists
    if (conn.socket) {
      try {
        if (typeof conn.socket.disconnect === "function") {
          conn.socket.disconnect();
        } else if (typeof conn.socket.close === "function") {
          conn.socket.close();
        }
      } catch (error) {
        console.error("[STOCK_DISCONNECT_ERROR]", {
          exchange,
          userId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // Clean up registry
    delete stockMarketDataRegistry[exchange][userId];

    console.log("[STOCK_SOCKET_DISCONNECTED]", {
      exchange,
      userId,
      symbolsTracked: conn.symbols.size,
    });
  },

  /**
   * Get all active connections for monitoring/debugging
   */
  getActiveConnections() {
    const result: Array<{
      exchange: string;
      userId: string;
      symbols: number;
      connected: boolean;
    }> = [];

    for (const exchange in stockMarketDataRegistry) {
      for (const userId in stockMarketDataRegistry[exchange]) {
        const conn = stockMarketDataRegistry[exchange][userId];
        result.push({
          exchange,
          userId,
          symbols: conn.symbols.size,
          connected: conn.socket !== null,
        });
      }
    }

    return result;
  },

  /**
   * Get detailed connection info for debugging
   */
  getConnectionDetails(exchange: StocksExchange, userId: string) {
    const conn = stockMarketDataRegistry[exchange]?.[userId];
    if (!conn) return null;

    return {
      exchange,
      userId,
      connected: conn.socket !== null,
      symbols: Array.from(conn.symbols),
      subscribers: Array.from(conn.subscribers.entries()).map(
        ([symbol, strategyIds]) => ({
          symbol,
          strategyIds: Array.from(strategyIds),
        })
      ),
    };
  },
};
