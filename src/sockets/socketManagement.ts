import { Platform, SocketConnection, socketRegistry } from "./utils";
import WebSocket from "ws";
import { Socket } from "socket.io-client";
export const SocketManager = {
  /**
   * Register a new socket connection
   */
  registerSocket(
    userId: string,
    exchange: string,
    market: string,
    socket: WebSocket | Socket,
    platform: Platform, // <-- add this
    pingInterval?: ReturnType<typeof setInterval>
  ): void {
    if (!socketRegistry[userId]) socketRegistry[userId] = {};
    if (!socketRegistry[userId][exchange])
      socketRegistry[userId][exchange] = {};

    socketRegistry[userId][exchange][market] = {
      socket,
      pingInterval,
      market,
      platform, // now this works
    };

    console.log("REGISTERED_SOCKET_CONNECTION", {
      userId,
      exchange,
      market,
      platform,
    });
  },
  /**
   * Get a socket connection if it exists
   */
  getSocket(
    userId: string,
    exchange: string,
    market: string
  ): SocketConnection | undefined {
    return socketRegistry[userId]?.[exchange]?.[market];
  },

  /**
   * Close and clean up a socket connection
   */
  removeSocket(userId: string, exchange: string, market: string): void {
    const connection = this.getSocket(userId, exchange, market);

    if (connection) {
      // Clean up ping interval
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }

      // Close socket if it's a WebSocket
      if (
        connection.socket instanceof WebSocket &&
        connection.socket.readyState === WebSocket.OPEN
      ) {
        connection.socket.close();
      }

      // Disconnect if it's a Socket.IO socket
      if ((connection.socket as Socket).disconnect) {
        (connection.socket as Socket).disconnect();
      }

      // Remove from registry
      if (socketRegistry[userId]?.[exchange]) {
        delete socketRegistry[userId][exchange][market];

        // Clean up empty objects
        if (Object.keys(socketRegistry[userId][exchange]).length === 0) {
          delete socketRegistry[userId][exchange];

          if (Object.keys(socketRegistry[userId]).length === 0) {
            delete socketRegistry[userId];
          }
        }
      }
      console.log("REMOVED_SOCKET_CONNECTION", {
        userId,
        exchange,
        market,
      });
    }
  },

  /**
   * Close all sockets for a user
   */
  removeUserSockets(userId: string): void {
    const userExchanges = socketRegistry[userId];
    if (userExchanges) {
      Object.keys(userExchanges).forEach((exchange) => {
        Object.keys(userExchanges[exchange]).forEach((market) => {
          this.removeSocket(userId, exchange, market);
        });
      });
    }
  },

  /**
   * Get all active users
   */
  getActiveUsers(): string[] {
    return Object.keys(socketRegistry);
  },

  /**
   * Get all active exchanges for a user
   */
  getUserExchanges(userId: string): string[] {
    return socketRegistry[userId] ? Object.keys(socketRegistry[userId]) : [];
  },

  /**
   * Get all active markets for a user and exchange
   */
  getUserExchangeMarkets(userId: string, exchange: string): string[] {
    return socketRegistry[userId]?.[exchange]
      ? Object.keys(socketRegistry[userId][exchange])
      : [];
  },

  /**
   * List all active connections (for debugging)
   */
  getActiveConnections(): {
    userId: string;
    exchange: string;
    market: string;
  }[] {
    const connections: {
      userId: string;
      exchange: string;
      market: string;
    }[] = [];

    Object.keys(socketRegistry).forEach((userId) => {
      Object.keys(socketRegistry[userId]).forEach((exchange) => {
        Object.keys(socketRegistry[userId][exchange]).forEach((market) => {
          connections.push({ userId, exchange, market });
        });
      });
    });

    return connections;
  },
};
