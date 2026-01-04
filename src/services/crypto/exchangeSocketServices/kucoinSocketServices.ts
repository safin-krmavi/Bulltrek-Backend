// import {
//   calculateROE,
//   fetchKucoinFuturesPositionBySymbol,
// } from "../../services/kucoinService";
import {
  CryptoExchange,
  CryptoTradeType,
  TradeSide,
  TradeStatus,
} from "@prisma/client";
import prisma from "../../../config/db.config";
import {
  calcQty,
  mapKuCoinFuturesOrderStatus,
} from "../../../constants/crypto/exchange/kucoin";
import { enqueueKucoinUpdate } from "../../../sockets/crypto/futureTradeQueues/kucoinFutureQueueManagement";
import { tradeStatusPriority } from "../../../constants/crypto";
import { applyFuturesTradeExecution } from "../../../utils/crypto/pnlCalc/futuresPnlEngine";

export async function updateTradeStatus(userId: string, order: any) {
  try {
    if (!order.orderId) return;

    const orderId = order.orderId.toString();
    const tradeStatus = mapKuCoinFuturesOrderStatus(order.type);
    const tradePrice = parseFloat(order.matchPrice || order.price || "0");
    const fee = parseFloat(order.fee || "0");
    const leverage = parseFloat(order.leverage || "0");

    const qtyComputed = await calcQty(order, true);
    const orderSize = qtyComputed?.qty;

    // STEP 1: Local order
    let localOrder = await prisma.cryptoOrder.findFirst({
      where: {
        exchangeOrderId: orderId,
        userId,
        exchange: CryptoExchange.KUCOIN,
      },
    });

    if (!localOrder) {
      localOrder = await prisma.cryptoOrder.create({
        data: {
          userId,
          exchange: CryptoExchange.KUCOIN,
          type: CryptoTradeType.FUTURES,
          symbol: order.symbol,
          side: order.side,
          orderType: order.orderType,
          requestedQty: parseFloat(order.size || "0"),
          requestedPrice: parseFloat(order.price || "0"),
          filledQty: orderSize,
          status: tradeStatus,
          exchangeOrderId: orderId,
          leverage,
        },
      });
    } else if (
      tradeStatusPriority[tradeStatus] > tradeStatusPriority[localOrder.status]
    ) {
      await prisma.cryptoOrder.update({
        where: { id: localOrder.id },
        data: {
          status: tradeStatus,
          filledQty: orderSize,
        },
      });
    }

    // STEP 2: Trade
    let existingTrade = await prisma.cryptoTrades.findFirst({
      where: {
        orderId: localOrder.id,
        userId,
        exchange: CryptoExchange.KUCOIN,
      },
    });

    let shouldApplyPnL = false;
    const executedStatuses = ["EXECUTED", "PARTIALLY_FILLED"] as const;

    if (!existingTrade) {
      existingTrade = await prisma.cryptoTrades.create({
        data: {
          userId,
          exchange: CryptoExchange.KUCOIN,
          type: CryptoTradeType.FUTURES,
          symbol: order.symbol,
          side: order.side,
          orderType: order.orderType,
          orderId: localOrder.id,
          quantity: parseFloat(order.size || "0"),
          price: tradePrice,
          fee,
          status: tradeStatus,
          leverage,
        },
      });

      shouldApplyPnL = executedStatuses.includes(
        tradeStatus as (typeof executedStatuses)[number]
      );
    } else if (
      tradeStatusPriority[tradeStatus] >
      tradeStatusPriority[existingTrade.status]
    ) {
      const prevStatus = existingTrade.status;

      await prisma.cryptoTrades.update({
        where: { id: existingTrade.id },
        data: {
          status: tradeStatus,
          price: tradePrice,
          fee,
        },
      });

      shouldApplyPnL =
        !executedStatuses.includes(
          prevStatus as (typeof executedStatuses)[number]
        ) &&
        executedStatuses.includes(
          tradeStatus as (typeof executedStatuses)[number]
        );
    }

    if (shouldApplyPnL) {
      await applyFuturesTradeExecution({
        userId,
        exchange: CryptoExchange.KUCOIN,
        symbol: order.symbol,
        side: order.side,
        quantity: orderSize,
        price: tradePrice,
        fee,
        tradeId: existingTrade.id,
      });
    }
  } catch (err) {
    console.error("ERROR_UPDATING_KUCOIN_FUTURES_TRADE_STATUS", {
      error: err,
      order,
    });
  }
}

export async function handleFilledFuturesOrder(order: any, userId: string) {
  try {
    if (!order.orderId) return;

    const orderId = order.orderId.toString();
    const tradeStatus = mapKuCoinFuturesOrderStatus(order.type);
    const tradePrice = parseFloat(order.matchPrice || order.price || "0");
    const fee = parseFloat(order.fee || "0");
    const leverage = parseFloat(order.leverage || "0");

    const qtyComputed = await calcQty(order, true);
    const orderSize = qtyComputed?.qty;

    // STEP 1: Local order
    let localOrder = await prisma.cryptoOrder.findFirst({
      where: {
        exchangeOrderId: orderId,
        userId,
        exchange: CryptoExchange.KUCOIN,
      },
    });

    if (!localOrder) {
      localOrder = await prisma.cryptoOrder.create({
        data: {
          userId,
          exchange: CryptoExchange.KUCOIN,
          type: CryptoTradeType.FUTURES,
          symbol: order.symbol,
          side: order.side,
          orderType: order.orderType,
          requestedQty: parseFloat(order.size || "0"),
          requestedPrice: parseFloat(order.price || "0"),
          filledQty: orderSize,
          status: tradeStatus,
          exchangeOrderId: orderId,
          leverage,
        },
      });
    } else if (
      tradeStatusPriority[tradeStatus] > tradeStatusPriority[localOrder.status]
    ) {
      await prisma.cryptoOrder.update({
        where: { id: localOrder.id },
        data: {
          status: tradeStatus,
          filledQty: orderSize,
        },
      });
    }

    // STEP 2: Trade
    let existingTrade = await prisma.cryptoTrades.findFirst({
      where: {
        orderId: localOrder.id,
        userId,
        exchange: CryptoExchange.KUCOIN,
      },
    });

    let shouldApplyPnL = false;
    const executedStatuses = ["EXECUTED", "PARTIALLY_FILLED"] as const;
    const isExecutable =
      tradeStatus === TradeStatus.EXECUTED ||
      tradeStatus === TradeStatus.PARTIALLY_FILLED;

    if (!existingTrade && isExecutable) {
      existingTrade = await prisma.cryptoTrades.create({
        data: {
          userId,
          exchange: CryptoExchange.KUCOIN,
          type: CryptoTradeType.FUTURES,
          symbol: order.symbol,
          side: order.side,
          orderType: order.orderType,
          orderId: localOrder.id,
          quantity: parseFloat(order.size || "0"),
          price: tradePrice,
          fee,
          status: tradeStatus,
          leverage,
        },
      });

      shouldApplyPnL = executedStatuses.includes(
        tradeStatus as (typeof executedStatuses)[number]
      );
    } else if (
      tradeStatusPriority[tradeStatus] >
      tradeStatusPriority[existingTrade.status]
    ) {
      const prevStatus = existingTrade.status;

      await prisma.cryptoTrades.update({
        where: { id: existingTrade.id },
        data: {
          status: tradeStatus,
          price: tradePrice,
          fee,
        },
      });

      shouldApplyPnL =
        !executedStatuses.includes(
          prevStatus as (typeof executedStatuses)[number]
        ) &&
        executedStatuses.includes(
          tradeStatus as (typeof executedStatuses)[number]
        );
    }

    if (shouldApplyPnL) {
      await applyFuturesTradeExecution({
        userId,
        exchange: CryptoExchange.KUCOIN,
        symbol: order.symbol,
        side: order.side,
        quantity: orderSize,
        price: tradePrice,
        fee,
        tradeId: existingTrade.id,
      });
    }
  } catch (err) {
    console.error("ERROR_UPDATING_KUCOIN_FUTURES_TRADE_STATUS", {
      error: err,
      order,
    });
  }
}

/**
 * Update the trade status in the database based on the order data
 */
export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process KuCoin Futures websocket messages
 * Handles order lifecycle: open -> match -> filled -> position tracking
 */
export async function handleKucoinFuturesWebsocketMessage(
  data: any,
  userId: string,
  credentials: {
    apiKey: string;
    apiSecret: string;
    apiPassphrase: string;
    apiKeyVersion: string;
  }
) {
  // const type = data.type?.toLowerCase();

  // Skip 'open' messages as we already create records when placing orders
  // if (data.orderType === "market") {
  //   console.log("SKIPPING_MARKET_MESSAGE_KUCOIN", {
  //     orderId: data.orderId,
  //   });

  //   return;
  // }
  // if (type === "match") {
  //   console.log("SKIPPING_MATCH_MESSAGE_KUCOIN", {
  //     orderId: data.orderId,
  //   });

  //   return;
  // }
  // if (type === "open") {
  //   console.log("SKIPPING_OPEN_MESSAGE_KUCOIN", {
  //     orderId: data.orderId,
  //   });
  //   return;
  // }
  try {
    enqueueKucoinUpdate(userId, data, credentials);
  } catch (error) {
    console.log("ERROR_FETCHING_ORDER_DETAILS_KUCOIN", { error });
  }
}
