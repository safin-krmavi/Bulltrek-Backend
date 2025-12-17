import { TradeSide } from "@prisma/client";
import { CommonOrderPayload } from "./tradeUtils";
import { resolveAngelToken } from "../../../constants/stocks/exchange/angelone";

export const handleAngelOneError = (error: any) => {
  const exchangeMessage =
    error.response?.data?.msg ||
    error.response?.data?.message ||
    error.message ||
    "Unknown exchange error";

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
    code: "BROKER_UNAVAILABLE",
    message: exchangeMessage,
  };
};

export type AngelOneOrderPayload = {
  variety: "NORMAL" | "STOPLOSS" | "AMO";
  tradingsymbol: string;
  symboltoken: string;
  exchange: "NSE" | "BSE" | "NFO" | "MCX";
  transactiontype: TradeSide;
  ordertype: "MARKET" | "LIMIT" | "STOPLOSS_LIMIT" | "STOPLOSS_MARKET";
  producttype: "INTRADAY" | "DELIVERY" | "CARRYFORWARD";
  duration: "DAY" | "IOC";
  price?: string;
  triggerprice?: string;
  quantity: string;
};

export async function mapToAngelOneOrder(
  payload: CommonOrderPayload
): Promise<AngelOneOrderPayload> {
  return {
    variety: "NORMAL",
    tradingsymbol: payload.symbol,
    symboltoken: await resolveAngelToken(payload.symbol, payload.exchange),
    exchange: payload.exchange,
    transactiontype: payload.side,
    ordertype:
      payload.orderType === "SL"
        ? "STOPLOSS_LIMIT"
        : payload.orderType === "SL-M"
        ? "STOPLOSS_MARKET"
        : payload.orderType,
    producttype:
      payload.product === "DELIVERY"
        ? "DELIVERY"
        : payload.product === "INTRADAY"
        ? "INTRADAY"
        : "CARRYFORWARD",
    duration: payload.validity ?? "DAY",
    price: payload.price?.toString(),
    triggerprice: payload.triggerPrice?.toString(),
    quantity: payload.quantity.toString(),
  };
}
