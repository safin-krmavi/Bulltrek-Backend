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

    // Idempotent guard
    if (!connection) return;

    const { socket, pingInterval } = connection;

    // ---- Clear ping interval safely ----
    if (pingInterval) {
      try {
        clearInterval(pingInterval);
      } catch (err) {
        console.error("PING_INTERVAL_CLEAR_FAILED", err);
      }
    }

    // ---- Close WebSocket safely ----
    try {
      if (socket instanceof WebSocket) {
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.close();
        }
      }
    } catch (err) {
      console.error("WEBSOCKET_CLOSE_FAILED", err);
    }

    // ---- Disconnect Socket.IO safely ----
    try {
      const ioSocket = socket as Socket;

      if (typeof ioSocket.disconnect === "function" && ioSocket.connected) {
        ioSocket.disconnect();
      }
    } catch (err) {
      console.error("SOCKET_IO_DISCONNECT_FAILED", err);
    }

    // ---- Remove from registry safely ----
    try {
      if (socketRegistry[userId]?.[exchange]?.[market]) {
        delete socketRegistry[userId][exchange][market];
      }

      if (
        socketRegistry[userId]?.[exchange] &&
        Object.keys(socketRegistry[userId][exchange]).length === 0
      ) {
        delete socketRegistry[userId][exchange];
      }

      if (
        socketRegistry[userId] &&
        Object.keys(socketRegistry[userId]).length === 0
      ) {
        delete socketRegistry[userId];
      }
    } catch (err) {
      console.error("SOCKET_REGISTRY_CLEANUP_FAILED", err);
    }

    console.log("REMOVED_SOCKET_CONNECTION", {
      userId,
      exchange,
      market,
    });
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
