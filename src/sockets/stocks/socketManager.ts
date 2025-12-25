import { StocksExchange } from "@prisma/client";
import { StockSocketConnection, stockSocketRegistry } from "./utils";

export const StockSocketManager = {
  registerSocket(
    userId: string,
    exchange: string,
    socket: any,
    platform: StocksExchange,
    market?: string,
    pingInterval?: ReturnType<typeof setInterval>
  ): void {
    if (!stockSocketRegistry[userId]) stockSocketRegistry[userId] = {};
    stockSocketRegistry[userId][exchange] = {
      socket,
      platform,
      market,
      pingInterval,
    };
    console.log("REGISTERED_STOCK_SOCKET", {
      userId,
      exchange,
      platform,
      market,
    });
  },

  getSocket(
    userId: string,
    exchange: string
  ): StockSocketConnection | undefined {
    return stockSocketRegistry[userId]?.[exchange];
  },

  removeSocket(userId: string, exchange: string): void {
    const connection = this.getSocket(userId, exchange);
    if (!connection) return;

    if (connection.pingInterval) clearInterval(connection.pingInterval);
    if (connection.socket?.disconnect) connection.socket.disconnect();
    else if (connection.socket?.close) connection.socket.close();

    delete stockSocketRegistry[userId][exchange];
    if (Object.keys(stockSocketRegistry[userId]).length === 0)
      delete stockSocketRegistry[userId];

    console.log("REMOVED_STOCK_SOCKET", { userId, exchange });
  },

  removeUserSockets(userId: string): void {
    const exchanges = Object.keys(stockSocketRegistry[userId] || {});
    exchanges.forEach((exchange) => this.removeSocket(userId, exchange));
  },

  getActiveUsers(): string[] {
    return Object.keys(stockSocketRegistry);
  },

  getUserExchanges(userId: string): string[] {
    return Object.keys(stockSocketRegistry[userId] || {});
  },

  getActiveConnections(): {
    clientId: string;
    exchange: string;
    market: string;
  }[] {
    const connections: {
      clientId: string;
      exchange: string;
      market: string;
    }[] = [];

    Object.keys(stockSocketRegistry).forEach((clientId) => {
      Object.keys(stockSocketRegistry[clientId]).forEach((exchange) => {
        Object.keys(stockSocketRegistry[clientId][exchange]).forEach(
          (market) => {
            connections.push({ clientId, exchange, market });
          }
        );
      });
    });

    return connections;
  },
};
