import { TradeSide, TradeStatus } from "@prisma/client";

export type TimeInForce = "GTC" | "IOC" | "FOK";
export type FuturesTimeInForce = "GTC" | "IOC" | "FOK" | "GTX";

export interface BinanceSpotOrderParams {
  symbol: string;
  side: TradeSide;
  orderType:
    | "LIMIT"
    | "MARKET"
    | "STOP_LOSS"
    | "STOP_LOSS_LIMIT"
    | "TAKE_PROFIT"
    | "TAKE_PROFIT_LIMIT"
    | "LIMIT_MAKER";
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: TimeInForce; // Defaults to "GTC"
}
export interface BinanceFuturesOrderParams {
  symbol: string;
  side: TradeSide;
  orderType:
    | "LIMIT"
    | "MARKET"
    | "STOP"
    | "STOP_MARKET"
    | "TAKE_PROFIT"
    | "TAKE_PROFIT_MARKET"
    | "TRAILING_STOP_MARKET";
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: FuturesTimeInForce; // Defaults to "GTC"
  closePosition?: boolean;
  positionSide?: "BOTH" | "LONG" | "SHORT";
  activationPrice?: number;
  callbackRate?: number;
}

export function mapBinanceFutureOrderStatus(status: string): TradeStatus {
  switch (status.toUpperCase()) {
    case "NEW":
      return TradeStatus.OPEN;
    case "FILLED":
      return TradeStatus.EXECUTED;
    case "PARTIALLY_FILLED":
      return TradeStatus.OPEN;
    case "CANCELED":
      return TradeStatus.CANCELLED;
    case "EXPIRED":
    case "EXPIRED_IN_MATCH":
    case "REJECTED":
      return TradeStatus.TIMEOUTED;

    default:
      return TradeStatus.OPEN;
  }
}

export function mapBinanceStatusToTradeStatus(status: string): TradeStatus {
  switch (status) {
    case "FILLED":
      return TradeStatus.EXECUTED;
    case "NEW":
      return TradeStatus.OPEN;
    case "PARTIALLY_FILLED":
      return TradeStatus.OPEN;
    case "CANCELED":
      return TradeStatus.CANCELLED;
    case "REJECTED":
      return TradeStatus.FAILED;
    case "EXPIRED":
      return TradeStatus.TIMEOUTED;
    default:
      return TradeStatus.OPEN;
  }
}

