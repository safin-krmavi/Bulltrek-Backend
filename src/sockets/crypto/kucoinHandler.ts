import WebSocket from "ws";
import crypto from "crypto";
import { SocketManager } from "../socketManagement";
import {
  generateHeadersKucoin,
  generateKucoinServerTime,
  generateSignatureKucoin,
} from "../../utils/crypto/exchange/kucoinUtils";
import { CryptoExchangeCredentials, logEvent } from "../utils";
import { CryptoExchange, CryptoTradeType, TradeStatus } from "@prisma/client";
import { enqueueTradeUpdate } from "./spotTradeQueues/kucoinQueueManagement";
import prisma from "../../config/db.config";
import { mapKucoinSpotOrderSocketStatus } from "../../constants/crypto/exchange/kucoin";
import { handleKucoinFuturesWebsocketMessage } from "../../services/crypto/exchangeSocketServices/kucoinSocketServices";
import { tradeStatusPriority } from "../../constants/crypto";
import { applySpotTradeExecution } from "../../utils/crypto/pnlCalc/spotPnlEngine";

// Interface to track token refresh timers
interface TokenRefreshTimer {
  userId: string;
  market: string;
  timerId: NodeJS.Timeout;
  tokenExpiry: number;
}

export async function getToken(
  credentials: any,
  market: string = "spot"
): Promise<any> {
  // Choose the appropriate endpoint and base URL based on market type
  const endpoint = "/api/v1/bullet-private";
  const baseUrl =
    market === "futures"
      ? "https://api-futures.kucoin.com"
      : "https://api.kucoin.com";

  
  console.log("GENERATING_KUCOIN_TOKEN", {
    market,
    url: `${baseUrl}${endpoint}`,
  });

  try {
    const url = baseUrl + endpoint;
    const headers = await generateHeadersKucoin(
      credentials,
      "POST",
      endpoint,
      "",
      market as "spot" | "futures"
    );

    const response = await fetch(url, {
      method: "POST",
      headers,
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `KuCoin ${market} API error: ${response.status} ${errorData}`
      );
    }

    const data = await response.json();
    if (!data.data) {
      throw new Error(
        `Invalid response from KuCoin ${market} API: ${JSON.stringify(data)}`
      );
    }

    return data.data;
  } catch (error) {
    console.log("ERROR_GENERATING_KUCOIN_TOKEN", { market, error });
    throw error;
  }
}
export const KuCoinHandler = {
  // Store token refresh timers
  tokenRefreshTimers: new Map<string, TokenRefreshTimer>(),

  // Generate server time for KuCoin
  async generateServerTime(): Promise<string> {
    try {
      const response = await fetch("https://api.kucoin.com/api/v1/timestamp");
      const data = await response.json();
      return data.data;
    } catch (error) {
      console.log("ERROR_GETTING_KUCOIN_SERVER_TIME", {
        error:
          (error as any)?.data ||
          (error as any)?.response?.data ||
          (error as any)?.message ||
          error,
      });
      return Date.now().toString();
    }
  },

  // Generate signature for KuCoin requests
  generateSignature(
    apiSecret: string,
    timestamp: string,
    method: string,
    endpoint: string
  ): string {
    const hmac = crypto.createHmac("sha256", apiSecret);
    return hmac.update(timestamp + method + endpoint).digest("base64");
  },

  // Generate unique key for timer tracking
  getTimerKey(userId: string, market: string): string {
    return `${userId}-${market}`;
  },

  // Schedule token refresh
  scheduleTokenRefresh(
    userId: string,
    credentials: CryptoExchangeCredentials,
    market: string,
    refreshIntervalMs: number = 24 * 60 * 60 * 1000 // 24 hours
  ): void {
    const timerKey = this.getTimerKey(userId, market);

    // Clear existing timer if it exists
    this.clearTokenRefreshTimer(timerKey);

    // Schedule the refresh
    const timerId = setTimeout(async () => {
      try {
        console.log("REFRESHING_KUCOIN_TOKEN", { userId, market });
        await this.refreshConnection(userId, credentials, market);
      } catch (error) {
        console.log("ERROR_REFRESHING_KUCOIN_TOKEN", {
          userId,
          market,
          error:
            (error as any)?.data ||
            (error as any)?.response?.data ||
            (error as any)?.message ||
            error,
        });

        // Retry refresh in 5 minutes on failure
        setTimeout(() => {
          this.scheduleTokenRefresh(userId, credentials, market, 5 * 60 * 1000);
        }, 5 * 60 * 1000);
      }
    }, refreshIntervalMs);

    // Store timer reference
    this.tokenRefreshTimers.set(timerKey, {
      userId,
      market,
      timerId,
      tokenExpiry: Date.now() + refreshIntervalMs,
    });

    console.log("KUCOIN_TOKEN_REFRESH_SCHEDULED", {
      userId,
      market,
      hoursUntilRefresh: refreshIntervalMs / 1000 / 60 / 60,
    });
  },

  // Clear token refresh timer
  clearTokenRefreshTimer(timerKey: string): void {
    const timer = this.tokenRefreshTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer.timerId);
      this.tokenRefreshTimers.delete(timerKey);
      console.log("KUCOIN_TOKEN_REFRESH_TIMER_CLEARED", { timerKey });
    }
  },

  // Refresh WebSocket connection with new token
  async refreshConnection(
    userId: string,
    credentials: CryptoExchangeCredentials,
    market: string
  ): Promise<void> {
    try {
      // Get existing socket connection
      const existingSocketConnection = SocketManager.getSocket(
        userId,
        CryptoExchange.KUCOIN,
        market
      );

      if (existingSocketConnection) {
        console.log("REFRESHING_KUCOIN_CONNECTION", { userId, market });

        // Access the actual WebSocket from the connection and close it
        if (
          existingSocketConnection.socket &&
          typeof existingSocketConnection.socket.close === "function"
        ) {
          existingSocketConnection.socket.close(1000, "Token refresh");
        }

        // Remove from socket manager
        SocketManager.removeSocket(userId, CryptoExchange.KUCOIN, market);

        // Wait a moment for cleanup
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Create new connection
      await this.connect(userId, credentials, market);
    } catch (error) {
      console.log("ERROR_REFRESHING_KUCOIN_CONNECTION", {
        userId,
        market,
        error:
          (error as any)?.data ||
          (error as any)?.response?.data ||
          (error as any)?.message ||
          error,
      });
      throw error;
    }
  },

  // Connect to KuCoin WebSocket
  async connect(
    userId: string,
    credentials: CryptoExchangeCredentials,
    market: string = "spot"
  ): Promise<WebSocket> {
    try {
      // Get the WebSocket connection token
      const authData = await getToken(credentials, market);
      const { token, instanceServers } = authData;

      if (!instanceServers || !instanceServers.length) {
        throw new Error(`No WebSocket instance servers returned for ${market}`);
      }

      // Create WebSocket URL
      const wsEndpoint = instanceServers[0].endpoint;
      const connectId = Date.now();
      const wsUrl = `${wsEndpoint}?token=${token}&connectId=${connectId}`;

      console.log("CONNECTING_TO_KUCOIN_WEBSOCKET", {
        userId,
        market,
        wsEndpoint,
      });

      // Create and configure WebSocket
      const socket = new WebSocket(wsUrl);

      // Create ping interval (KuCoin requires a ping every 30 seconds)
      const pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ id: Date.now(), type: "ping" }));
        }
      }, 30000);

      // Register socket with manager
      SocketManager.registerSocket(
        userId,
        CryptoExchange.KUCOIN,
        market,
        socket,
        "crypto",
        pingInterval
      );

      // Set up event handlers
      this.setupEventHandlers(socket, userId, credentials, market);

      // Schedule token refresh for 24 hours (or slightly less to be safe)
      this.scheduleTokenRefresh(
        userId,
        credentials,
        market,
        23.5 * 60 * 60 * 1000
      );

      return socket;
    } catch (error) {
      console.log("ERROR_CONNECTING_TO_KUCOIN_WEBSOCKET", {
        userId,
        market,
        error:
          (error as any)?.data ||
          (error as any)?.response?.data ||
          (error as any)?.message ||
          error,
      });
      throw error;
    }
  },

  // Enhanced cleanup method
  async disconnect(userId: string, market: string): Promise<void> {
    const timerKey = this.getTimerKey(userId, market);

    // Clear token refresh timer
    this.clearTokenRefreshTimer(timerKey);

    // Get socket connection and close it properly
    const socketConnection = SocketManager.getSocket(
      userId,
      CryptoExchange.KUCOIN,
      market
    );
    if (
      socketConnection &&
      socketConnection.socket &&
      typeof socketConnection.socket.close === "function"
    ) {
      socketConnection.socket.close(1000, "Manual disconnect");
    }

    // Remove socket (this will also handle cleanup)
    SocketManager.removeSocket(userId, CryptoExchange.KUCOIN, market);

    console.log("KUCOIN_WEBSOCKET_DISCONNECTED", { userId, market });
  },

  // Set up all event handlers for KuCoin WebSocket
  setupEventHandlers(
    socket: WebSocket,
    userId: string,
    credentials: CryptoExchangeCredentials,
    market: string
  ): void {
    socket.addEventListener("open", () => {
      logEvent("CONNECTED", {
        userId,
        exchange: CryptoExchange.KUCOIN,
        market,
      });

      // Subscribe to market-specific channel
      const topicPrefix =
        market === "futures" ? "/contractMarket" : "/spotMarket";
      socket.send(
        JSON.stringify({
          id: Date.now(),
          type: "subscribe",
          topic: `${topicPrefix}/tradeOrders`,
          privateChannel: true,
          response: true,
        })
      );
      market === "futures"
        ? socket.send(
            JSON.stringify({
              id: Date.now(),
              type: "subscribe",
              topic: `${topicPrefix}/advancedOrders`,
              privateChannel: true,
              response: true,
            })
          )
        : {};

      logEvent("SUBSCRIBED", {
        userId,
        exchange: CryptoExchange.KUCOIN,
        market,
        topicPrefix,
      });
    });

    socket.addEventListener("message", async (event) => {
      try {
        const message = JSON.parse(event.data.toString());
        if (message.type === "message") {
          if (
            market === "spot" &&
            message.topic === "/spotMarket/tradeOrders" &&
            message.subject === "orderChange"
          ) {
            console.log("SPOT TRADE", message.data);
            enqueueTradeUpdate(
              message.data,
              userId,
              this.handleSpotOrderUpdate
            );

            // await this.handleSpotOrderUpdate(message.data, userId);
          } else if (
            (market === "futures" &&
              message.topic === "/contractMarket/tradeOrders") ||
            message.topic === "/contractMarket/advancedOrders"
          ) {
            console.log("KUCOIN FUTURES TRADE");
            await this.handleFuturesOrderUpdate(
              message.data,
              userId,
              credentials
            );
          }
        } else if (message.type === "welcome") {
          console.log("KUCOIN_WEBSOCKET_WELCOME_RECEIVED", {
            userId,
            market,
          });
        } else if (message.type === "ack") {
          logEvent("CLOSED", {
            userId,
            market,
            exchange: CryptoExchange.KUCOIN,
            data: message,
          });
        } else if (message.type === "pong") {
          // Pong received, connection still alive
        } else {
          console.log("KUCOIN_WEBSOCKET_UNKNOWN_MESSAGE", {
            userId,
            market,
            data: message,
          });
        }
      } catch (error) {
        console.log("ERROR_PROCESSING_KUCOIN_MESSAGE", {
          userId,
          market,
          error:
            (error as any)?.data ||
            (error as any)?.response?.data ||
            (error as any)?.message ||
            error,
        });
      }
    });

    socket.addEventListener("close", (event) => {
      logEvent("CLOSED", {
        userId,
        market,
        exchange: CryptoExchange.COINDCX,
        code: event.code,
        reason: event.reason,
      });

      // Only clear timer if this wasn't a planned refresh
      if (event.reason !== "Token refresh") {
        const timerKey = this.getTimerKey(userId, market);
        this.clearTokenRefreshTimer(timerKey);
      }

      // Remove socket from registry
      SocketManager.removeSocket(userId, CryptoExchange.KUCOIN, market);

      // Only attempt reconnect if this wasn't a planned refresh
      if (event.reason !== "Token refresh") {
        setTimeout(() => {
          console.log("ATTEMPTING_KUCOIN_WEBSOCKET_RECONNECT", {
            userId,
            market,
          });

          this.connect(userId, credentials, market).catch((err) => {
            console.log("ERROR_RECONNECTING_KUCOIN_WEBSOCKET", {
              userId,
              market,
              error:
                (err as any)?.data ||
                (err as any)?.response?.data ||
                (err as any)?.message ||
                err,
            });
          });
        }, 5000);
      }
    });

    socket.addEventListener("error", (error) => {
      console.log("KUCOIN_WEBSOCKET_ERROR", {
        userId,
        market,
        error:
          (error as any)?.data ||
          (error as any)?.response?.data ||
          (error as any)?.message ||
          error,
      });
    });
  },

  // Get token refresh status
  getTokenRefreshStatus(
    userId: string,
    market: string
  ): {
    scheduled: boolean;
    timeUntilRefresh?: number;
    nextRefreshAt?: Date;
  } {
    const timerKey = this.getTimerKey(userId, market);
    const timer = this.tokenRefreshTimers.get(timerKey);

    if (!timer) {
      return { scheduled: false };
    }

    const timeUntilRefresh = timer.tokenExpiry - Date.now();

    return {
      scheduled: true,
      timeUntilRefresh: Math.max(0, timeUntilRefresh),
      nextRefreshAt: new Date(timer.tokenExpiry),
    };
  },

  // Handle KuCoin spot order updates
  async handleSpotOrderUpdate(message: any, userId: string): Promise<void> {
    console.log("KUCOIN_SPOT_ORDER_UPDATE", { userId, data: message });

    const data = message;
    const orderId = data.id || data.orderId;
    const orderType = data.orderType.toUpperCase();
    const tradeStatus = mapKucoinSpotOrderSocketStatus(data);

    try {
      // Step 1: Find or create local order
      let localOrder = await prisma.cryptoOrder.findFirst({
        where: {
          exchangeOrderId: orderId,
          userId,
          exchange: CryptoExchange.KUCOIN,
        },
      });

      if (!localOrder) {
        localOrder = await prisma.cryptoOrder.create({
          data: {
            userId,
            exchange: CryptoExchange.KUCOIN,
            type: CryptoTradeType.SPOT,
            symbol: data.symbol,
            side: data.side.toUpperCase(),
            orderType,
            requestedQty: parseFloat(data.size || data.filledSize || "0"),
            requestedPrice: parseFloat(data.price || "0"),
            filledQty: parseFloat(data.filledSize || "0"),
            status: tradeStatus,
            exchangeOrderId: orderId,
          },
        });
      } else if (
        tradeStatusPriority[tradeStatus] >
        tradeStatusPriority[localOrder.status]
      ) {
        await prisma.cryptoOrder.update({
          where: { id: localOrder.id },
          data: {
            status: tradeStatus,
            filledQty: parseFloat(data.filledSize || "0"),
          },
        });
      }

      // Step 2: Find or create trade
      let existingTrade = await prisma.cryptoTrades.findFirst({
        where: {
          orderId: localOrder.id,
          userId,
          exchange: CryptoExchange.KUCOIN,
        },
        orderBy: { createdAt: "desc" },
      });

      if (
        !existingTrade &&
        tradeStatus === TradeStatus.EXECUTED
        // ||
        // tradeStatus === TradeStatus.PARTIALLY_FILLED
      ) {
        const newTrade = await prisma.cryptoTrades.create({
          data: {
            userId,
            exchange: CryptoExchange.KUCOIN,
            type: CryptoTradeType.SPOT,
            symbol: data.symbol,
            side: data.side.toUpperCase(),
            orderType,
            orderId: localOrder.id,
            quantity: parseFloat(data.filledSize || "0"),
            price: parseFloat(data.price || "0"),
            fee: parseFloat(data.fee || "0"),
            status: tradeStatus,
          },
        });

        await applySpotTradeExecution({
          userId,
          exchange: CryptoExchange.KUCOIN,
          asset: data.symbol,
          side: data.side.toUpperCase(),
          quantity: parseFloat(data.filledSize || "0"),
          price: parseFloat(data.price || "0"),
          fee: parseFloat(data.fee || "0"),
          tradeId: newTrade.id,
        });
      } else if (existingTrade) {
        if (
          tradeStatusPriority[tradeStatus] >
          tradeStatusPriority[existingTrade.status]
        ) {
          await prisma.cryptoTrades.update({
            where: { id: existingTrade.id },
            data: { status: tradeStatus, fee: parseFloat(data.fee || "0") },
          });
        }
      }
    } catch (err) {
      console.error("ERROR_PROCESSING_KUCOIN_SPOT_ORDER", {
        error: err,
        message,
      });
    }
  },

  // Handle KuCoin futures order updates
  async handleFuturesOrderUpdate(
    data: any,
    userId: string,
    credentials: CryptoExchangeCredentials
  ): Promise<void> {
    console.log("KUCOIN_FUTURES_ORDER_UPDATE", { userId, data });

    // Use existing handler from your code
    await handleKucoinFuturesWebsocketMessage(data, userId, credentials as any);
  },
};
