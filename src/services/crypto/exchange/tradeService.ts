import { CryptoExchange } from "@prisma/client";
import {
  createKucoinFutureTrade,
  createKucoinSpotTrade,
  ensureKucoinMarginMode,
  getKucoinFuturesActivePositions,
} from "./kucoinService";
import {
  mapFuturesOrderTypeToCoinDCX,
  mapSpotOrderTypeToCoinDCX,
} from "../../../utils/crypto/exchange/coindcxUtils";
import {
  createBinanceFutureTrade,
  createBinanceSpotTrade,
  getBinanceFuturesActivePositions,
} from "./binanceService";
import {
  createCoinDCXFutureTrade,
  createCoinDCXSpotTrade,
  getCoinDCXFuturesActivePositions,
} from "./coindcxService";
import { getCryptoCredentials } from "../credentialsService";

export async function createSpotTrade(
  exchange: CryptoExchange,
  credentials: any,
  payload: any
) {
  switch (exchange) {
    case CryptoExchange.BINANCE:
      return createBinanceSpotTrade(credentials, payload);

    case CryptoExchange.KUCOIN:
      return createKucoinSpotTrade(credentials, payload);

    case CryptoExchange.COINDCX:
      payload.orderType = mapSpotOrderTypeToCoinDCX(payload.orderType);
      return createCoinDCXSpotTrade(credentials, {
        ...payload,
        quantity: Number(payload.quantity),
      });

    default:
      throw { code: "UNSUPPORTED_EXCHANGE", message: "Spot not supported" };
  }
}

export async function createFuturesTrade(
  exchange: CryptoExchange,
  credentials: any,
  payload: any
) {
  switch (exchange) {
    case CryptoExchange.BINANCE:
      return await createBinanceFutureTrade(credentials, payload);
    case CryptoExchange.KUCOIN:
      payload.positionMarginType =
        payload.positionMarginType?.toLowerCase() === "crossed"
          ? "CROSS"
          : "ISOLATED";
      await ensureKucoinMarginMode(
        {
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          apiPassphrase: credentials.apiPassphrase,
          apiKeyVersion: credentials.apiKeyVersion,
        },
        payload.symbol,
        payload.positionMarginType
      );

      return createKucoinFutureTrade(credentials, payload);
    case CryptoExchange.COINDCX:
      payload.orderType = mapFuturesOrderTypeToCoinDCX(payload.orderType);

      return createCoinDCXFutureTrade(credentials, payload);
    default:
      throw { code: "UNSUPPORTED_EXCHANGE", message: "Futures not supported" };
  }
}

export const getActiveFuturesPositions = async (
  userId: string,
  exchange: CryptoExchange
) => {
  const rawCredentials = await getCryptoCredentials(userId, exchange);

  const credentials = Array.isArray(rawCredentials)
    ? rawCredentials[0]
    : rawCredentials;

  if (!credentials) {
    throw {
      code: "BAD_REQUEST",
      message: "Credentials not found",
    };
  }

  try {
    switch (exchange) {
      case CryptoExchange.BINANCE:
        return await getBinanceFuturesActivePositions(credentials);

      case CryptoExchange.KUCOIN:
        // if (!credentials.apiPassphrase || !credentials.apiKeyVersion) {
        //   throw {
        //     code: "BAD_REQUEST",
        //     message: "KuCoin requires apiPassphrase and apiKeyVersion",
        //   };
        // }

        return await getKucoinFuturesActivePositions(credentials);

      case CryptoExchange.COINDCX:
        return await getCoinDCXFuturesActivePositions(credentials);

      default:
        throw {
          code: "UNSUPPORTED_EXCHANGE",
          message: `Unsupported exchange: ${exchange}`,
        };
    }
  } catch (error: any) {
    throw error.code
      ? error
      : {
          code: "EXCHANGE_UNAVAILABLE",
          message: error.message || "Failed to fetch positions",
        };
  }
};
