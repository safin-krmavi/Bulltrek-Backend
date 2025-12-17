import { Platform, SocketConnection, socketRegistry } from "./utils";
import WebSocket from "ws";
import { Socket } from "socket.io-client";
export const SocketManager = {
  /**
   * Register a new socket connection
   */
  registerSocket(
    clientId: string,
    exchange: string,
    market: string,
    socket: WebSocket | Socket,
    platform: Platform, // <-- add this
    pingInterval?: ReturnType<typeof setInterval>
  ): void {
    if (!socketRegistry[clientId]) socketRegistry[clientId] = {};
    if (!socketRegistry[clientId][exchange])
      socketRegistry[clientId][exchange] = {};

    socketRegistry[clientId][exchange][market] = {
      socket,
      pingInterval,
      market,
      platform, // now this works
    };

    console.log("REGISTERED_SOCKET_CONNECTION", {
      clientId,
      exchange,
      market,
      platform,
    });
  },
  /**
   * Get a socket connection if it exists
   */
  getSocket(
    clientId: string,
    exchange: string,
    market: string
  ): SocketConnection | undefined {
    return socketRegistry[clientId]?.[exchange]?.[market];
  },

  /**
   * Close and clean up a socket connection
   */
  removeSocket(clientId: string, exchange: string, market: string): void {
    const connection = this.getSocket(clientId, exchange, market);

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
      if (socketRegistry[clientId]?.[exchange]) {
        delete socketRegistry[clientId][exchange][market];

        // Clean up empty objects
        if (Object.keys(socketRegistry[clientId][exchange]).length === 0) {
          delete socketRegistry[clientId][exchange];

          if (Object.keys(socketRegistry[clientId]).length === 0) {
            delete socketRegistry[clientId];
          }
        }
      }
      console.log("REMOVED_SOCKET_CONNECTION", {
        clientId,
        exchange,
        market,
      });
    }
  },

  /**
   * Close all sockets for a user
   */
  removeUserSockets(clientId: string): void {
    const userExchanges = socketRegistry[clientId];
    if (userExchanges) {
      Object.keys(userExchanges).forEach((exchange) => {
        Object.keys(userExchanges[exchange]).forEach((market) => {
          this.removeSocket(clientId, exchange, market);
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
  getUserExchanges(clientId: string): string[] {
    return socketRegistry[clientId]
      ? Object.keys(socketRegistry[clientId])
      : [];
  },

  /**
   * Get all active markets for a user and exchange
   */
  getUserExchangeMarkets(clientId: string, exchange: string): string[] {
    return socketRegistry[clientId]?.[exchange]
      ? Object.keys(socketRegistry[clientId][exchange])
      : [];
  },

  /**
   * List all active connections (for debugging)
   */
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

    Object.keys(socketRegistry).forEach((clientId) => {
      Object.keys(socketRegistry[clientId]).forEach((exchange) => {
        Object.keys(socketRegistry[clientId][exchange]).forEach((market) => {
          connections.push({ clientId, exchange, market });
        });
      });
    });

    return connections;
  },
};
