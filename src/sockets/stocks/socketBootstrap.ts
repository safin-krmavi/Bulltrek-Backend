import { Express } from "express";
import { StocksExchange } from "@prisma/client";
import prisma from "../../config/db.config";
import { getStocksCredentials } from "../../services/stocks/credentialsService";
import { ZerodhaOrderHandler } from "./handlers/zerodhaHandler";
import { StockSocketManager } from "./socketManager";
import { getStocksUsers } from "../../services/stocks/userService";
import { StockSocketConnection } from "./utils";
import { KotakOrderHandler } from "./handlers/kotakHandler";

/**
 * Connect to all sockets for a user across all stock exchanges
 */
export async function connectUserExchanges(
  userId: string,
  exchanges: string[]
): Promise<void> {
  for (const exchange of exchanges) {
    try {
      console.log("USER_STOCK_EXCHANGE_CONNECTING", { userId, exchange });

      const credsData = await getStocksCredentials(
        userId,
        exchange as StocksExchange
      );

      if (!credsData || (Array.isArray(credsData) && credsData.length === 0)) {
        console.log("No credentials found for", userId, exchange);
        continue;
      }

      const credentials = Array.isArray(credsData) ? credsData[0] : credsData;

      if (!credentials) {
        console.log("Credentials not found", { userId, exchange });
        continue;
      }

      // Exchange-specific socket connection
      if (exchange === "ZERODHA") {
        await ZerodhaOrderHandler.connect(userId, {
          accessToken: credentials.accessToken,
          apiKey: process.env.ZERODHA_API_KEY!,
        });
      } else if (exchange === "KOTAK") {
        await KotakOrderHandler.connect(userId, {
          tradingToken: credentials.accessToken,
          tradingSid: credentials.refreshToken,
          dataCenter: credentials.dataCenter,
        });
      } else {
        console.log("UNSUPPORTED_STOCK_EXCHANGE", { exchange });
      }
    } catch (error) {
      console.error("ERROR_CONNECTING_USER_TO_STOCK_EXCHANGE", {
        userId,
        exchange,
        error,
      });
    }
  }
}

/**
 * Bootstrap all stock WebSocket connections on server start
 */
export async function bootstrapStockSockets(): Promise<void> {
  console.log("BOOTSTRAPPING_STOCK_SOCKETS");

  const users = await getStocksUsers();
  console.log("USERS_FOUND_WITH_EXCHANGE_CONNECTIONS", {
    usersCount: users.length,
  });

  for (const user of users) {
    if (user.exchanges?.length) {
      await connectUserExchanges(user.id, user.exchanges);
    }
  }

  console.log("ALL_STOCK_SOCKETS_INITIALIZED");
}

/**
 * Connect a new user to all their stock exchanges
 */
export async function connectNewUser(userId: string): Promise<void> {
  try {
    console.log("SETTING_UP_NEW_USER_CONNECTIONS", { userId });

    const user = await prisma.stocksUser.findUnique({
      where: { id: userId },
      include: { credentials: true },
    });

    if (!user) throw new Error(`User ${userId} not found`);

    const exchanges = user.credentials.map((cred) => cred.exchange);

    if (!exchanges.length) {
      console.log("USER_HAS_NO_EXCHANGES_CONFIGURED", { userId });
      return;
    }

    console.log("CONNECTING_NEW_USER_TO_EXCHANGES", {
      userId,
      exchangesCount: exchanges.length,
    });

    await connectUserExchanges(userId, exchanges);
    console.log("NEW_USER_CONNECTED_TO_ALL_EXCHANGES", { userId });
  } catch (error) {
    console.error("ERROR_CONNECTING_NEW_USER", { userId, error });
    throw error;
  }
}

/**
 * Reconnect a user (disconnect first, then connect)
 */
export async function reconnectUser(userId: string): Promise<void> {
  StockSocketManager.removeUserSockets(userId);
  await new Promise((r) => setTimeout(r, 1000));
  await connectNewUser(userId);
}

/**
 * Register StockSocketManager with Express app
 */
export function registerStockSocketManager(app: Express) {
  app.locals.stockSocketManager = {
    bootstrap: bootstrapStockSockets,
    connectUser: connectNewUser,
    disconnectUser: StockSocketManager.removeUserSockets,
    getActiveConnections: () => {
      const connections: { userId: string; exchange: string }[] = [];
      StockSocketManager.getActiveUsers().forEach((userId) => {
        StockSocketManager.getUserExchanges(userId).forEach((exchange) => {
          connections.push({ userId, exchange });
        });
      });
      return connections;
    },
  };

  console.log("STOCK_SOCKET_MANAGER_REGISTERED");

  bootstrapStockSockets()
    .then(() =>
      console.log("ALL_EXISTING_STOCK_SOCKET_CONNECTIONS_INITIALIZED")
    )
    .catch((err) => console.error("ERROR DURING STOCK SOCKET BOOTSTRAP", err));

  process.on("SIGINT", () => {
    StockSocketManager.getActiveUsers().forEach((userId) =>
      StockSocketManager.removeUserSockets(userId)
    );
    console.log("ALL_STOCK_SOCKETS_CLOSED");
    process.exit();
  });
}
