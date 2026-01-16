import {
  CryptoExchange,
  CryptoTradeType,
  TradeSide,
  TradeStatus,
} from "@prisma/client";
import {
  cancelKucoinFuturesOrder,
  cancelKucoinSpotOrder,
  createKucoinFuturesOrder,
  createKucoinSpotOrder,
  ensureKucoinMarginMode,
  fetchKucoinFuturesActivePositions,
  fetchKucoinFuturesOrderById,
  fetchKucoinFuturesOrders,
  fetchKucoinFuturesTrades,
  fetchKucoinOpenSpotOrders,
  fetchKucoinSpotOrderById,
  fetchKucoinSpotTrades,
} from "./kucoinService";
import {
  mapFuturesOrderTypeToCoinDCX,
  mapSpotOrderTypeToCoinDCX,
} from "../../../utils/crypto/exchange/coindcxUtils";
import {
  createBinanceFuturesOrder,
  createBinanceSpotOrder,
  fetchBinanceFuturesOrders,
  fetchBinanceFuturesActivePositions,
  fetchBinanceSpotTrades,
  cancelBinanceSpotOrder,
  cancelBinanceFuturesOrder,
  fetchBinanceSpotOrderById,
  fetchBinanceOpenSpotOrders,
  fetchBinanceFuturesOrderById,
  fetchBinanceFuturesTrades,
} from "./binanceService";
import {
  createCoinDCXFutureTrade,
  createCoinDCXSpotTrade,
  getCoinDCXFuturesActivePositions,
} from "./coindcxService";
import { getCryptoCredentials } from "../credentialsService";
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
        exchangeResponse = await createBinanceSpotOrder(credentials, payload);
        break;
      case CryptoExchange.KUCOIN:
        exchangeResponse = await createKucoinSpotOrder(credentials, payload);
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
        exchangeResponse = await createBinanceFuturesOrder(
          credentials,
          payload
        );

        break;

      case CryptoExchange.KUCOIN:
        payload.positionMarginType =
          payload.positionMarginType?.toLowerCase() === "crossed"
            ? "CROSS"
            : "ISOLATED";

        console.log("positionMarginType", payload.positionMarginType);

        // await ensureKucoinMarginMode(
        //   {
        //     apiKey: credentials.apiKey,
        //     apiSecret: credentials.apiSecret,
        //     apiPassphrase: credentials.apiPassphrase,
        //     apiKeyVersion: credentials.apiKeyVersion,
        //   },
        //   payload.symbol,
        //   payload.positionMarginType
        // );

        exchangeResponse = await createKucoinFuturesOrder(credentials, payload);

        break;

      case CryptoExchange.COINDCX:
        payload.orderType = mapFuturesOrderTypeToCoinDCX(payload.orderType);

        exchangeResponse = await createCoinDCXFutureTrade(credentials, payload);

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

    return { exchangeResponse };
  } catch (error: any) {
    console.error("ERROR_CREATING_FUTURES_TRADE", {
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
        return await fetchBinanceFuturesActivePositions(credentials);

      case CryptoExchange.KUCOIN:
        return await fetchKucoinFuturesActivePositions(credentials);

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

interface TradeHistoryParams {
  userId: string;
  exchange?: CryptoExchange;
  type?: CryptoTradeType;
  symbol?: string;
  side?: TradeSide;
  status?: TradeStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export const getCryptoTradeHistoryService = async (
  params: TradeHistoryParams
) => {
  const {
    userId,
    exchange,
    type,
    symbol,
    side,
    status,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  } = params;

  const where: any = {
    userId,
    ...(exchange && { exchange }),
    ...(type && { type }),
    ...(symbol && { symbol }),
    ...(side && { side }),
    ...(status && { status }),
    ...(startDate || endDate
      ? {
          executedAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        }
      : {}),
  };

  const [trades, total] = await Promise.all([
    prisma.cryptoTrades.findMany({
      where,
      orderBy: { executedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        order: {
          select: {
            orderType: true,
            requestedQty: true,
            requestedPrice: true,
            exchangeOrderId: true,
          },
        },
      },
    }),
    prisma.cryptoTrades.count({ where }),
  ]);

  return {
    trades,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export async function cancelCryptoOrderService({
  userId,
  exchange,
  type,
  symbol,
  orderId,
}: any) {
  const rawCredentials = await getCryptoCredentials(userId, exchange);

  const credentials = Array.isArray(rawCredentials)
    ? rawCredentials[0]
    : rawCredentials;

  if (!credentials) {
    throw new Error("Credentials not found");
  }

  switch (exchange) {
    case CryptoExchange.BINANCE:
      return type === CryptoTradeType.SPOT
        ? cancelBinanceSpotOrder(credentials, symbol, userId, orderId)
        : cancelBinanceFuturesOrder(credentials, symbol, orderId, userId);

    case CryptoExchange.KUCOIN:
      return type === CryptoTradeType.SPOT
        ? cancelKucoinSpotOrder(
            {
              apiKey: credentials.apiKey,
              apiSecret: credentials.apiSecret,
              apiPassphrase: credentials.apiPassphrase,
              apiKeyVersion: credentials.apiKeyVersion,
            },
            orderId,
            symbol,
            userId
          )
        : cancelKucoinFuturesOrder(credentials, orderId, userId);

    default:
      throw { code: "UNSUPPORTED_EXCHANGE", message: "Unsupported exchange" };
  }
}

export async function getCryptoOrdersService({
  userId,
  exchange,
  type,
  symbol,
  orderId,
}: any) {
  const rawCredentials = await getCryptoCredentials(userId, exchange);

  const credentials = Array.isArray(rawCredentials)
    ? rawCredentials[0]
    : rawCredentials;

  if (!credentials) {
    throw new Error("Credentials not found");
  }
  switch (exchange) {
    case CryptoExchange.BINANCE:
      if (type === CryptoTradeType.SPOT) {
        return orderId
          ? fetchBinanceSpotOrderById(credentials, symbol, orderId)
          : fetchBinanceOpenSpotOrders(credentials, symbol);
      }
      return orderId
        ? fetchBinanceFuturesOrderById(credentials, symbol, orderId)
        : fetchBinanceFuturesOrders(credentials, symbol);

    case CryptoExchange.KUCOIN:
      if (type === CryptoTradeType.SPOT) {
        return orderId
          ? fetchKucoinSpotOrderById(credentials, orderId, symbol)
          : fetchKucoinOpenSpotOrders(credentials, symbol);
      }
      return orderId
        ? fetchKucoinFuturesOrderById(credentials, orderId, symbol)
        : fetchKucoinFuturesOrders(credentials, symbol);

    default:
      throw { code: "UNSUPPORTED_EXCHANGE", message: "Unsupported exchange" };
  }
}

export async function getCryptoTradesService({
  userId,
  exchange,
  type,
  symbol,
}: any) {
  const rawCredentials = await getCryptoCredentials(userId, exchange);

  const credentials = Array.isArray(rawCredentials)
    ? rawCredentials[0]
    : rawCredentials;

  if (!credentials) {
    throw new Error("Credentials not found");
  }
  switch (exchange) {
    case CryptoExchange.BINANCE:
      return type === CryptoTradeType.SPOT
        ? fetchBinanceSpotTrades(credentials, symbol)
        : fetchBinanceFuturesTrades(credentials, { symbol });

    case CryptoExchange.KUCOIN:
      return type === CryptoTradeType.SPOT
        ? fetchKucoinSpotTrades(credentials)
        : fetchKucoinFuturesTrades(credentials, symbol);

    default:
      throw { code: "UNSUPPORTED_EXCHANGE", message: "Unsupported exchange" };
  }
}
