import { error } from "console";
import crypto from "crypto";
import {
  CoinDCXFuturesOrderType,
  CoinDCXSpotOrderType,
} from "../../../constants/crypto/exchange/coindcx";

export const generateSignatureCoinDCX = (
  payload: object,
  secret: string
): string => {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
};

export const handleCoinDCXError = (error: any) => {
  const exchangeMessage =
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message ||
    "Unknown exchange error";
  console.log(error);
  if (error.response?.status === 401 || error.response?.status === 403) {
    throw { code: "AUTH_INVALID", message: exchangeMessage };
  }

  if (error.response?.status === 429) {
    throw { code: "RATE_LIMITED", message: exchangeMessage };
  }

  if (error.response?.status === 400) {
    throw { code: "BAD_REQUEST", message: exchangeMessage };
  }

  throw { code: "EXCHANGE_UNAVAILABLE", message: exchangeMessage };
};

export function mapSpotOrderTypeToCoinDCX(
  orderType: string
): CoinDCXSpotOrderType {
  switch (orderType) {
    case "MARKET":
      return CoinDCXSpotOrderType.MARKET;
    case "LIMIT":
      return CoinDCXSpotOrderType.LIMIT;
    default:
      throw {
        code: "BAD_REQUEST",
        message: `Unsupported order type for CoinDCX: ${orderType}`,
      };
  }
}

export function mapFuturesOrderTypeToCoinDCX(
  orderType: string
): CoinDCXFuturesOrderType {
  switch (orderType) {
    case "MARKET":
      return CoinDCXFuturesOrderType.MARKET;
    case "LIMIT":
      return CoinDCXFuturesOrderType.LIMIT;
    case "STOP_LIMIT":
      return CoinDCXFuturesOrderType.STOP_LIMIT;
    case "STOP_MARKET":
      return CoinDCXFuturesOrderType.STOP_MARKET;
    case "TAKE_PROFIT_LIMIT":
      return CoinDCXFuturesOrderType.TAKE_PROFIT_LIMIT;
    case "TAKE_PROFIT_MARKET":
      return CoinDCXFuturesOrderType.TAKE_PROFIT_MARKET;
    default:
      throw {
        code: "BAD_REQUEST",
        message: `Unsupported futures order type for CoinDCX: ${orderType}`,
      };
  }
}
