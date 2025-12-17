import { CryptoExchange, CryptoTradeType, TradeStatus } from "@prisma/client";
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
import { createOrderIntent } from "../../../utils/crypto/createOrderIntent";
import prisma from "../../../config/db.config";

export async function createSpotTrade(
  userId: string,
  exchange: CryptoExchange,
  credentials: any,
  payload: any
) {
  // const order = await createOrderIntent({
  //   userId,
  //   exchange,
  //   type: CryptoTradeType.SPOT,
  //   symbol: payload.symbol,
  //   side: payload.side,
  //   requestedQty: payload.quantity,
  //   requestedPrice: payload.price,
  //   orderType: payload.orderType,
  // });
  try {
    let exchangeResponse;

    switch (exchange) {
      case CryptoExchange.BINANCE:
        exchangeResponse = await createBinanceSpotTrade(credentials, payload);
        break;
      case CryptoExchange.KUCOIN:
        exchangeResponse = await createKucoinSpotTrade(credentials, payload);
        break;
      case CryptoExchange.COINDCX:
        payload.orderType = mapSpotOrderTypeToCoinDCX(payload.orderType);
        exchangeResponse = await createCoinDCXSpotTrade(credentials, {
          ...payload,
          quantity: Number(payload.quantity),
        });
        break;

      default:
        throw { code: "UNSUPPORTED_EXCHANGE", message: "Spot not supported" };
    }

    console.log("EXCHANGE RESPONSE", exchangeResponse);
    // await prisma.cryptoOrder.update({
    //   where: { id: order.id },
    //   data: { exchangeOrderId: exchangeResponse.orderId?.toString() || null },
    // });

    return { exchangeResponse };
  } catch (error: any) {
    console.error("ERROR_CREATING_SPOT_TRADE", {
      userId,
      exchange,
      payload,
      error: error?.message || error,
    });

    // await prisma.cryptoOrder.update({
    //   where: { id: order.id },
    //   data: { status: TradeStatus.CANCELLED },
    // });
    throw error;
  }
}

export async function createFuturesTrade(
  userId: string,
  exchange: CryptoExchange,
  credentials: any,
  payload: any
) {
  // const order = await createOrderIntent({
  //   userId,
  //   exchange,
  //   type: CryptoTradeType.FUTURES,
  //   symbol: payload.symbol,
  //   side: payload.side,
  //   requestedQty: payload.quantity,
  //   requestedPrice: payload.price,
  //   orderType: payload.orderType,
  // });

  try {
    let exchangeResponse;

    switch (exchange) {
      case CryptoExchange.BINANCE:
        exchangeResponse = await createBinanceFutureTrade(credentials, payload);

        break;

      case CryptoExchange.KUCOIN:
        console.log("HI");
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

        exchangeResponse = createKucoinFutureTrade(credentials, payload);

        break;

      case CryptoExchange.COINDCX:
        payload.orderType = mapFuturesOrderTypeToCoinDCX(payload.orderType);

        exchangeResponse = createCoinDCXFutureTrade(credentials, payload);

        break;

      default:
        throw {
          code: "UNSUPPORTED_EXCHANGE",
          message: "Futures not supported",
        };
    }
    // await prisma.cryptoOrder.update({
    //   where: { id: order.id },
    //   data: { exchangeOrderId: exchangeResponse.orderId?.toString() || null },
    // });

    return {  exchangeResponse };
  } catch (error: any) {
    console.error("ERROR_CREATING_SPOT_TRADE", {
      userId,
      exchange,
      payload,
      error: error?.message || error,
    });

    // await prisma.cryptoOrder.update({
    //   where: { id: order.id },
    //   data: { status: TradeStatus.CANCELLED },
    // });
    throw error;
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
