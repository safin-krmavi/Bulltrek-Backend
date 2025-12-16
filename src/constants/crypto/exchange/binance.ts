import { TradeSide } from "@prisma/client";

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
