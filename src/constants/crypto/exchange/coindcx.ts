import { TradeSide, TradeStatus } from "@prisma/client";

export enum CoinDCXSpotOrderType {
  MARKET = "market_order",
  LIMIT = "limit_order",
}

export enum CoinDCXFuturesOrderType {
  MARKET = "market_order",
  LIMIT = "limit_order",
  STOP_LIMIT = "stop_limit",
  STOP_MARKET = "stop_market",
  TAKE_PROFIT_LIMIT = "take_profit_limit",
  TAKE_PROFIT_MARKET = "take_profit_market",
}
export interface CoinDCXSpotOrderParams {
  side: TradeSide; // "BUY" | "SELL"
  orderType: CoinDCXSpotOrderType; // MARKET | LIMIT
  symbol: string; // e.g., "SHIBINR","B-ETH_USDT"
  quantity: number;
  price?: number; // Only for LIMIT orders
}
export interface CoinDCXFuturesOrderParams {
  side: TradeSide;
  orderType: string;
  symbol: string; // e.g., "B-ETH_USDT"
  quantity: number;
  positionMarginType: "isolated" | "crossed";
  price?: number; // Required for non-MARKET orders
  stopPrice?: number; // Required for stop/limit orders
  leverage?: number;
  marginCurrency?: string; // Defaults to something like "USDT"
  notification?: string; // Default "email_notification"
  timeInForce?: string; // Optional, e.g., "good_till_cancel"
}

export function safeISO(date: any) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const mapStatus = (status: string): TradeStatus => {
  const s = status.toLowerCase();
  switch (s) {
    case "initial":
    case "open":
    case "partially_filled":
      return TradeStatus.OPEN;

    case "filled":
      return TradeStatus.EXECUTED;

    case "partially_cancelled":
    case "cancelled":
      return TradeStatus.CANCELLED;

    case "rejected":
      return TradeStatus.FAILED;

    case "untriggered":
      return TradeStatus.OPEN;

    case "failed":
      return TradeStatus.FAILED;

    default:
      return TradeStatus.OPEN;
  }
};

export const resolveOrderTypeKey = (value: string): string => {
  for (const [key, val] of Object.entries(CoinDCXSpotOrderType)) {
    if (val === value) return key;
  }
  for (const [key, val] of Object.entries(CoinDCXFuturesOrderType)) {
    if (val === value) return key;
  }
  throw new Error(`Unknown order type value: ${value}`);
};
