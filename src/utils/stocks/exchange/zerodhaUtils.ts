import { TradeSide } from "@prisma/client";
import { CommonOrderPayload } from "./tradeUtils";

export const handleZerodhaError = (error: any) => {
  const exchangeMessage =
    error.response?.data?.msg ||
    error.response?.data?.message ||
    error.message ||
    "Unknown exchange error";
  console.log(error);

  if (error.response?.status === 401 || error.response?.status === 403) {
    throw {
      code: "AUTH_INVALID",
      message: exchangeMessage,
    };
  }

  if (error.response?.status === 429) {
    throw {
      code: "RATE_LIMITED",
      message: exchangeMessage,
    };
  }

  throw {
    code: "EXCHANGE_UNAVAILABLE",
    message: exchangeMessage,
  };
};

export function endOfDay() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
export type ZerodhaOrderPayload = {
  variety?: "regular" | "amo" | "co" | "iceberg" | "auction";
  tradingsymbol: string;
  exchange: "NSE" | "BSE" | "NFO" | "MCX" | "CDS" | "BCD";
  transaction_type: TradeSide;
  order_type: "MARKET" | "LIMIT" | "SL" | "SL-M";
  quantity: number;
  product: "CNC" | "MIS" | "NRML" | "MTF";
  price?: number;
  trigger_price?: number;
  validity?: "DAY" | "IOC" | "TTL";
};

export function mapToZerodhaOrder(
  payload: CommonOrderPayload
): ZerodhaOrderPayload {
  const order: any = {
    variety: "regular",
    tradingsymbol: payload.symbol,
    exchange: payload.exchange,
    transaction_type: payload.side,
    order_type: payload.orderType,
    quantity: Number(payload.quantity),
    product:
      payload.product === "DELIVERY"
        ? "CNC"
        : payload.product === "INTRADAY"
        ? "MIS"
        : "NRML",
    validity: payload.validity ?? "DAY",
  };

  // Only include price for orders that need it
  if (payload.orderType !== "MARKET") {
    order.price = payload.price;
    order.trigger_price = payload.triggerPrice;
  }

  return order;
}
