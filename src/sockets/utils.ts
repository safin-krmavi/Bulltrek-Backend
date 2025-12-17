// Types
import WebSocket from "ws";
import { Socket } from "socket.io-client";
export type CryptoExchangeCredentials = {
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiKeyVersion?: string;
};

export type Platform = "crypto" | "stock";

export type SocketConnection = {
  socket: WebSocket | Socket;
  pingInterval?: ReturnType<typeof setInterval>; // optional
  market?: string; // 'spot' or 'futures'
  platform: Platform;
};

// --------------------------
// SOCKET REGISTRY
// --------------------------

// Primary data store for all active connections
export const socketRegistry: {
  [clientId: string]: {
    [exchange: string]: {
      [market: string]: SocketConnection;
    };
  };
} = {};

export function logEvent(event: string, details: Record<string, any>) {
  const { clientId, exchange, market, ...rest } = details;
  console.log(
    `[${event}] | Exchange: ${exchange} | Market: ${market || "-"} | Client: ${
      clientId || "-"
    } |`,
    rest
  );
}
