import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import WebSocket from "ws";

export type MarketDataConnection = {
  socket: WebSocket;
  exchange: CryptoExchange;
  segment: CryptoTradeType;
  symbols: Set<string>; // tracked symbols
  subscribers: Map<string, Set<string>>;
  // symbol -> strategyIds
};

export const marketDataRegistry: {
  [exchange: string]: {
    [segment in CryptoTradeType]?: MarketDataConnection;
  };
} = {};
