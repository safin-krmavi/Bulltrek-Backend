// commonOrder.dto.ts
export type CommonOrderPayload = {
  symbol: string; // "RELIANCE"
  exchange: "NSE" | "BSE" | "NFO" | "MCX";
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL-M";
  quantity: number;
  product: "INTRADAY" | "DELIVERY" | "CARRYFORWARD";
  price?: number;
  triggerPrice?: number;
  validity?: "DAY" | "IOC";
};

export type InstrumentType =
  | "SPOT"
  | "FUTURES"
  | "STOCK_CASH"
  | "STOCK_FUTURES"
  | "STOCK_OPTIONS";
