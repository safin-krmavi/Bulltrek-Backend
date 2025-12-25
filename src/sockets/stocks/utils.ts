import { StocksExchange } from "@prisma/client";
import WebSocket from "ws";

export type StockSocketConnection = {
  socket: WebSocket | any; // can be KiteTicker, Upstox WS, etc.
  platform: StocksExchange;
  market?: string; // optional if an exchange has spot/futures/segment
  pingInterval?: ReturnType<typeof setInterval>;
};

export const stockSocketRegistry: {
  [userId: string]: {
    [exchange: string]: StockSocketConnection;
  };
} = {};
