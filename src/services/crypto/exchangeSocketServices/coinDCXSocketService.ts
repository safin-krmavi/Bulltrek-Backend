import { wait } from "../exchangeSocketServices/kucoinSocketServices";
import {
  mapStatus,
  resolveOrderTypeKey,
} from "../../../constants/crypto/exchange/coindcx";

import { getFuturesPositionsByFilters } from "../../../services/crypto/exchange/coindcxService";
import {
  CryptoExchange,
  CryptoTradeType,
  TradeSide,
  TradeStatus,
} from "@prisma/client";
import prisma from "../../../config/db.config";
import { enqueueCoinDCXFuturesUpdate } from "../../../sockets/crypto/futureTradeQueues/coindcxFutureQueueManagement";
import { applyFuturesTradeExecution } from "../../../utils/crypto/pnlCalc/futuresPnlEngine";
import { tradeStatusPriority } from "../../../constants/crypto";

export async function updateCoinDCXTradeStatus(userId: string, order: any) {
  try {
    const exchangeOrderId = (order.id || order.order_id)?.toString();
    if (!exchangeOrderId) return;

    const tradeStatus = mapStatus(order.status);
    // const filledQty = parseFloat(order.filled_quantity || "0");
    const requestedQty = parseFloat(order.total_quantity || "0");
    const fee = parseFloat(order.fee_amount || "0");
    const leverage = parseFloat(order.leverage || "0");

    const isStopOrder = [
      "take_profit_limit",
      "take_profit_market",
      "stop_limit",
      "stop_market",
    ].includes(order.order_type);

    const tradePrice = isStopOrder
      ? parseFloat(order.stop_price || "0")
      : parseFloat(order.avg_price || "0") !== 0
      ? parseFloat(order.avg_price)
      : parseFloat(order.price || "0");

    console.log("[COINDCX_FUTURES] Processing order", {
      exchangeOrderId,
      status: tradeStatus,
      // filledQty,
      requestedQty,
    });

    // STEP 1: FIND / CREATE LOCAL ORDER

    let localOrder = await prisma.cryptoOrder.findFirst({
      where: {
        exchangeOrderId,
        userId,
        exchange: CryptoExchange.COINDCX,
      },
    });

    if (!localOrder) {
      console.log("[COINDCX_FUTURES] Creating local order", {
        exchangeOrderId,
      });

      localOrder = await prisma.cryptoOrder.create({
        data: {
          userId,
          exchange: CryptoExchange.COINDCX,
          type: CryptoTradeType.FUTURES,
          symbol: order.pair,
          side: order.side.toUpperCase(),
          orderType: resolveOrderTypeKey(order.order_type),
          requestedQty,
          requestedPrice: tradePrice,
          filledQty: requestedQty,
          status: tradeStatus,
          exchangeOrderId,
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
          filledQty: requestedQty,
        },
      });
    }

    // STEP 2: FIND / CREATE TRADE

    let existingTrade = await prisma.cryptoTrades.findFirst({
      where: {
        orderId: localOrder.id,
        userId,
        exchange: CryptoExchange.COINDCX,
      },
      orderBy: { createdAt: "desc" },
    });

    const executedStatuses = ["EXECUTED", "PARTIALLY_FILLED"] as const;
    let shouldApplyPnL = false;

    if (!existingTrade) {
      existingTrade = await prisma.cryptoTrades.create({
        data: {
          userId,
          exchange: CryptoExchange.COINDCX,
          type: CryptoTradeType.FUTURES,
          symbol: order.pair,
          side: order.side.toUpperCase(),
          orderType: resolveOrderTypeKey(order.order_type),
          orderId: localOrder.id,
          quantity: requestedQty,
          price: tradePrice,
          fee,
          status: tradeStatus,
          leverage,
        },
      });

      shouldApplyPnL = executedStatuses.includes(
        tradeStatus as (typeof executedStatuses)[number]
      );

      console.log("[COINDCX_FUTURES] Trade created", {
        tradeId: existingTrade.id,
        status: tradeStatus,
      });
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

      console.log("[COINDCX_FUTURES] Trade updated", {
        tradeId: existingTrade.id,
        prevStatus,
        newStatus: tradeStatus,
      });
    }

    // STEP 3: APPLY PNL (ONCE)

    if (shouldApplyPnL) {
      console.log("[COINDCX_FUTURES] Applying PnL", {
        tradeId: existingTrade.id,
      });

      await applyFuturesTradeExecution({
        userId,
        exchange: CryptoExchange.COINDCX,
        symbol: order.pair,
        side: order.side.toUpperCase(),
        quantity: requestedQty,
        price: tradePrice,
        fee,
        tradeId: existingTrade.id,
      });
    }
  } catch (error) {
    console.error("[COINDCX_FUTURES] ERROR", {
      orderId: order?.id,
      error,
    });
  }
}

export async function handleFilledCoinDCXFuturesOrder(
  order: any,
  userId: string
) {
  try {
    const exchangeOrderId = (order.id || order.order_id)?.toString();
    if (!exchangeOrderId) return;

    const tradeStatus = mapStatus(order.status);
    // const filledQty = parseFloat(order.filled_quantity || "0");
    const requestedQty = parseFloat(order.total_quantity || "0");
    const fee = parseFloat(order.fee_amount || "0");
    const leverage = parseFloat(order.leverage || "0");

    const isStopOrder = [
      "take_profit_limit",
      "take_profit_market",
      "stop_limit",
      "stop_market",
    ].includes(order.order_type);

    const tradePrice = isStopOrder
      ? parseFloat(order.stop_price || "0")
      : parseFloat(order.avg_price || "0") !== 0
      ? parseFloat(order.avg_price)
      : parseFloat(order.price || "0");

    console.log("[COINDCX_FUTURES] Processing order", {
      exchangeOrderId,
      status: tradeStatus,
      // filledQty,
      requestedQty,
    });

    // STEP 1: FIND / CREATE LOCAL ORDER

    let localOrder = await prisma.cryptoOrder.findFirst({
      where: {
        exchangeOrderId,
        userId,
        exchange: CryptoExchange.COINDCX,
      },
    });

    if (!localOrder) {
      console.log("[COINDCX_FUTURES] Creating local order", {
        exchangeOrderId,
      });

      localOrder = await prisma.cryptoOrder.create({
        data: {
          userId,
          exchange: CryptoExchange.COINDCX,
          type: CryptoTradeType.FUTURES,
          symbol: order.pair,
          side: order.side.toUpperCase(),
          orderType: resolveOrderTypeKey(order.order_type),
          requestedQty,
          requestedPrice: tradePrice,
          filledQty: requestedQty,
          status: tradeStatus,
          exchangeOrderId,
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
          filledQty: requestedQty,
        },
      });
    }

    // STEP 2: FIND / CREATE TRADE

    let existingTrade = await prisma.cryptoTrades.findFirst({
      where: {
        orderId: localOrder.id,
        userId,
        exchange: CryptoExchange.COINDCX,
      },
      orderBy: { createdAt: "desc" },
    });

    const executedStatuses = ["EXECUTED", "PARTIALLY_FILLED"] as const;
    let shouldApplyPnL = false;

    if (!existingTrade) {
      existingTrade = await prisma.cryptoTrades.create({
        data: {
          userId,
          exchange: CryptoExchange.COINDCX,
          type: CryptoTradeType.FUTURES,
          symbol: order.pair,
          side: order.side.toUpperCase(),
          orderType: resolveOrderTypeKey(order.order_type),
          orderId: localOrder.id,
          quantity: requestedQty,
          price: tradePrice,
          fee,
          status: tradeStatus,
          leverage,
        },
      });

      shouldApplyPnL = executedStatuses.includes(
        tradeStatus as (typeof executedStatuses)[number]
      );

      console.log("[COINDCX_FUTURES] Trade created", {
        tradeId: existingTrade.id,
        status: tradeStatus,
      });
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

      console.log("[COINDCX_FUTURES] Trade updated", {
        tradeId: existingTrade.id,
        prevStatus,
        newStatus: tradeStatus,
      });
    }

    // STEP 3: APPLY PNL (ONCE)

    if (shouldApplyPnL) {
      console.log("[COINDCX_FUTURES] Applying PnL", {
        tradeId: existingTrade.id,
      });

      await applyFuturesTradeExecution({
        userId,
        exchange: CryptoExchange.COINDCX,
        symbol: order.pair,
        side: order.side.toUpperCase(),
        quantity: requestedQty,
        price: tradePrice,
        fee,
        tradeId: existingTrade.id,
      });
    }
  } catch (error) {
    console.error("[COINDCX_FUTURES] ERROR", {
      orderId: order?.id,
      error,
    });
  }
}

export async function handleCoinDCXFuturesWebsocketMessage(
  response: any,
  userId: string,
  credentials: {
    apiKey: string;
    apiSecret: string;
  }
) {
  let orders: any[];
  try {
    orders = JSON.parse(response.data);
  } catch (err) {
    console.log("ERROR_PARSING_ORDER_UPDATE_DATA_COINDCX", {
      error: err,
    });
    return;
  }

  for (const order of orders) {
    if (!order.status) {
      console.log("ORDER_STATUS_MISSING_COINDCX", { error: order });
      return;
    }

    const status = order.status?.toLowerCase();

    try {
      console.log("PROCESSING_COINDCX_FUTURES_WEBSOCKET_MESSAGE");
      enqueueCoinDCXFuturesUpdate(
        order,
        userId,
        handleFilledCoinDCXFuturesOrder
      );
    } catch (error) {
      console.log("ERROR_UPDATING_TRADE_STATUS_COINDCX", { error });
    }

    // // Check if order is filled based on CoinDCX's response structure
    // if (status === "filled") {
    //   try {
    //     console.log("Handling filled futures order");

    //     // Pass order data to handler
    //     await handleFilledCoinDCXFuturesOrder(order, userId, credentials);
    //   } catch (error) {
    //     console.log("Error handling filled CoinDCX order:", { error });
    //   }
    // }
  }
}
