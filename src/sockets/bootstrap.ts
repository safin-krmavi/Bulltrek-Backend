import { Express } from "express";
import { CryptoExchange } from "@prisma/client";
import { getCryptoCredentials } from "../services/crypto/credentialsService";
import { KuCoinHandler } from "./crypto/kucoinHandler";
import { CoinDCXHandler } from "./crypto/coindcxHandler";
import { BinanceHandler } from "./crypto/binanceHandler";
import { SocketManager } from "./socketManagement";
import prisma from "../config/db.config";
import { getCryptoUsers } from "../services/crypto/userService";
import { CryptoExchangeCredentials } from "./utils";

/**
 * Connect to all sockets for a user across all exchanges
 */
export async function connectUserExchanges(
  userId: string,
  exchanges: string[]
): Promise<void> {
  for (const exchange of exchanges) {
    try {
      console.log("USER_EXCHANGE_CONNECTING", { userId, exchange });

      const credsData = await getCryptoCredentials(
        userId,
        exchange as CryptoExchange
      );
      if (!credsData || (Array.isArray(credsData) && credsData.length === 0)) {
        console.log("No credentials found for", userId, exchange);
        continue;
      }
      let credentials: CryptoExchangeCredentials;

      if (Array.isArray(credsData)) {
        if (credsData.length === 0) {
          console.log("No credentials found for", userId, exchange);
          return;
        }
        // Pick the first credential
        credentials = {
          apiKey: credsData[0].apiKey,
          apiSecret: credsData[0].apiSecret,
          apiPassphrase: credsData[0].apiPassphrase,
          apiKeyVersion: credsData[0].apiKeyVersion,
        };
      } else {
        // Single object
        credentials = {
          apiKey: credsData.apiKey,
          apiSecret: credsData.apiSecret,
          apiPassphrase: credsData.apiPassphrase,
          apiKeyVersion: credsData.apiKeyVersion,
        };
      }

      // Connect to exchange-specific sockets
      if (exchange === CryptoExchange.KUCOIN) {
        // KuCoin needs both spot and futures connections
        await Promise.all([
          KuCoinHandler.connect(userId, credentials, "spot"),
          KuCoinHandler.connect(userId, credentials, "futures"),
        ]);
      } else if (exchange === CryptoExchange.COINDCX) {
        CoinDCXHandler.connect(userId, credentials);
      } else if (exchange === CryptoExchange.BINANCE) {
        await Promise.all([
          BinanceHandler.connect(userId, credentials, "SPOT"),
          BinanceHandler.connect(userId, credentials, "FUTURES"),
          //   // Add futures when ready:
        ]);
      } else {
        console.log("UNSUPPORTED_EXCHANGE", { exchange });
      }
    } catch (error) {
      console.log("ERROR_CONNECTING_USER_TO_EXCHANGE", {
        error:
          (error as any)?.data ||
          (error as any)?.response?.data ||
          (error as any).message,
        userId,
        exchange,
      });
    }
  }
}

/**
 * Bootstrap all WebSocket connections on server start
 */
export async function bootstrapSockets(): Promise<void> {
  try {
    console.log("WEBSOCKET_CONNECTIONS_BOOTSTRAPPING");

    // Get all users with exchange connections
    const users = await getCryptoUsers();

    console.log("USERS_FOUND_WITH_EXCHANGE_CONNECTIONS", {
      usersCount: users.length,
    });

    // Connect each user to their exchanges
    for (const user of users) {
      const exchanges = user.exchanges;

      if (exchanges.length > 0) {
        await connectUserExchanges(user.id, exchanges);
      }
    }

    console.log("ALL_WEBSOCKET_CONNECTIONS_INITIALIZED");
  } catch (error) {
    console.log("ERROR_BOOTSTRAPPING_WEBSOCKET_CONNECTIONS", {
      error:
        (error as any)?.data ||
        (error as any)?.response?.data ||
        (error as any).message,
    });
  }
}

// --------------------------
// USER MANAGEMENT FUNCTIONS
// --------------------------

/**
 * Connect a specific user to a specific exchange
 */
export async function connectUserToExchange(
  userId: string,
  exchange: string
): Promise<void> {
  try {
    await connectUserExchanges(userId, [exchange]);
    console.log("USER_CONNECTED_TO_EXCHANGE", { userId, exchange });
  } catch (error) {
    console.log("ERROR_CONNECTING_USER_TO_EXCHANGE_SPECIFIC", {
      error:
        (error as any)?.data ||
        (error as any)?.response?.data ||
        (error as any).message,
      userId,
      exchange,
    });
    throw error;
  }
}

/**
 * Disconnect a specific user from a specific exchange
 */
export function disconnectUserFromExchange(
  userId: string,
  exchange: string
): void {
  const markets = SocketManager.getUserExchangeMarkets(userId, exchange);

  for (const market of markets) {
    SocketManager.removeSocket(userId, exchange, market);
  }
  // if (exchange === CryptoExchange.HYPE) {
  //   try {
  //     HyperliquidHandler.unsubscribeFromWebSocket(userId);
  //     HyperliquidHandler.disconnect(userId);
  //   } catch (error) {
  //     console.log("ERROR_DISCONNECTING_HYPE_WEBSOCKET", {
  //       userId,
  //       error: (error as any)?.message,
  //     });
  //   }
  // }

  console.log("USER_DISCONNECTED_FROM_EXCHANGE", { userId, exchange });
}

/**
 * Disconnect a user from all exchanges
 */
export function disconnectUser(userId: string): void {
  SocketManager.removeUserSockets(userId);
  console.log("USER_DISCONNECTED_FROM_ALL_EXCHANGES", { userId });
}

export async function connectNewUser(userId: string): Promise<void> {
  try {
    console.log("SETTING_UP_NEW_USER_CONNECTIONS", { userId });

    // Get user's exchange list from database
    const user = await prisma.cryptoUser.findUnique({
      where: { id: userId },
      include: { credentials: true },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const exchanges = user.credentials.map((cred) => cred.exchange);

    if (exchanges.length === 0) {
      console.log("USER_HAS_NO_EXCHANGES_CONFIGURED", { userId });
      return;
    }

    console.log("CONNECTING_NEW_USER_TO_EXCHANGES", {
      userId,
      exchangesCount: exchanges.length,
    });

    // Connect to all user's exchanges
    await connectUserExchanges(userId, exchanges);

    console.log("NEW_USER_CONNECTED_TO_ALL_EXCHANGES", { userId });
  } catch (error) {
    console.log("ERROR_CONNECTING_NEW_USER", {
      error:
        (error as any)?.data ||
        (error as any)?.response?.data ||
        (error as any).message,
      userId,
    });
    throw error;
  }
}

/**
 * Reconnect a user (disconnect first, then connect)
 */
export async function reconnectUser(userId: string): Promise<void> {
  try {
    console.log("USER_RECONNECTING", { userId });

    // First disconnect existing connections
    disconnectUser(userId);

    // Wait a bit to ensure cleanup
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Then connect again
    await connectNewUser(userId);

    console.log("USER_SUCCESSFULLY_RECONNECTED", { userId });
  } catch (error) {
    console.log("ERROR_RECONNECTING_USER", {
      error:
        (error as any)?.data ||
        (error as any)?.response?.data ||
        (error as any).message,
      userId,
    });
    throw error;
  }
}
// --------------------------
// SERVER REGISTRATION
// --------------------------

/**
 * Register with Fastify server
 */
export function registerSocketManager(app: Express) {
  // Step 1: register SocketManager globally
  app.locals.socketManager = {
    bootstrap: bootstrapSockets,
    connectUser: connectUserToExchange,
    disconnectUser,
    getActiveConnections: SocketManager.getActiveConnections,
  };

  console.log("SOCKET MANAGER REGISTERED");

  // Step 2: bootstrap all existing connections
  bootstrapSockets()
    .then(() => console.log("ALL EXISTING SOCKET CONNECTIONS INITIALIZED"))
    .catch((err) => console.error("ERROR DURING SOCKET BOOTSTRAP", err));

  // Optional: graceful shutdown
  process.on("SIGINT", () => {
    const activeUsers = SocketManager.getActiveUsers();
    for (const userId of activeUsers) {
      disconnectUser(userId);
    }
    console.log("ALL_WEBSOCKET_CONNECTIONS_CLOSED");
    process.exit();
  });
}
