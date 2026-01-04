import {
  mapBinanceFutureOrderStatus,
  mapBinanceStatusToTradeStatus,
} from "../../../constants/crypto/exchange/binance";
import prisma from "../../../config/db.config";
import {
  CryptoExchange,
  CryptoTradeType,
  TradeSide,
  TradeStatus,
} from "@prisma/client";
import { enqueueBinanceFuturesUpdate } from "../../../sockets/crypto/futureTradeQueues/binanceFutureQueueManagement";
import { applySpotTradeExecution } from "../../../utils/crypto/pnlCalc/spotPnlEngine";
import { applyFuturesTradeExecution } from "../../../utils/crypto/pnlCalc/futuresPnlEngine";
import { tradeStatusPriority } from "../../../constants/crypto";

export async function handleBinanceSpotOrderUpdate(
  message: any,
  userId: string
) {
  try {
    const data = message;
    const orderId = data.i?.toString(); // Binance order ID
    const orderType = data.o?.toUpperCase();
    const orderStatus = data.X;
    const tradeStatus = mapBinanceStatusToTradeStatus(orderStatus);

    // if (orderStatus === "REJECTED" || data.r !== "NONE") {
    //   console.log("IGNORING_NEW_OR_REJECTED_ORDER_BINANCE");
    //   return;
    // }

    // Step 1: Find or create local order
    let localOrder = await prisma.cryptoOrder.findFirst({
      where: {
        exchangeOrderId: orderId,
        userId,
        exchange: CryptoExchange.BINANCE,
      },
    });

    if (!localOrder) {
      localOrder = await prisma.cryptoOrder.create({
        data: {
          userId,
          exchange: CryptoExchange.BINANCE,
          type: CryptoTradeType.SPOT,
          symbol: data.s,
          side: data.S as TradeSide,
          orderType,
          requestedQty: parseFloat(data.q || "0"),
          requestedPrice: parseFloat(data.p || "0"),
          status: tradeStatus,
          filledQty: parseFloat(data.z || "0"),
          exchangeOrderId: orderId,
        },
      });
    } else {
      // Update filled qty & status
      if (
        tradeStatusPriority[tradeStatus] >
        tradeStatusPriority[localOrder.status]
      ) {
        await prisma.cryptoOrder.update({
          where: { id: localOrder.id },
          data: { status: tradeStatus, filledQty: parseFloat(data.z || "0") },
        });
      }
    }

    // Step 2: Find or create trade
    let existingTrade = await prisma.cryptoTrades.findFirst({
      where: {
        orderId: localOrder.id,
        userId,
        exchange: CryptoExchange.BINANCE,
      },
      orderBy: { createdAt: "desc" },
    });
    const isExecutable =
      tradeStatus === TradeStatus.EXECUTED ||
      tradeStatus === TradeStatus.PARTIALLY_FILLED;

    if (!existingTrade && isExecutable) {
      const newTrade = await prisma.cryptoTrades.create({
        data: {
          userId,
          exchange: CryptoExchange.BINANCE,
          type: CryptoTradeType.SPOT,
          symbol: data.s,
          side: data.S as TradeSide,
          orderType,
          orderId: localOrder.id, // reference local order
          quantity: parseFloat(data.l || "0"),
          price: parseFloat(data.L || "0"),
          fee: parseFloat(data.n || "0"),
          status: tradeStatus,
        },
      });

      await applySpotTradeExecution({
        userId,
        exchange: CryptoExchange.BINANCE,
        asset: data.s,
        side: data.S,
        quantity: parseFloat(data.l || "0"),
        price: parseFloat(data.L || "0"),
        fee: parseFloat(data.n || "0"),
        tradeId: newTrade.id,
      });
    } else if (existingTrade) {
      // Only update trade if new status has higher priority
      if (
        tradeStatusPriority[tradeStatus] >
        tradeStatusPriority[existingTrade.status]
      ) {
        await prisma.cryptoTrades.update({
          where: { id: existingTrade.id },
          data: { status: tradeStatus, fee: parseFloat(data.n || "0") },
        });
      }
    }
  } catch (err) {
    console.error("ERROR_PROCESSING_BINANCE_SPOT_ORDER", {
      error: err,
      message,
    });
  }
}

export async function updateBinanceFuturesTradeStatus(
  userId: string,
  order: any,
  credentials: any
) {
  try {
    if (!order.i) return;

    const orderId = order.i.toString();
    const tradeStatus = mapBinanceFutureOrderStatus(order.X);
    const tradePrice = parseFloat(order.ap || order.p || "0");
    const filledQty = parseFloat(order.z || "0");
    const fee = parseFloat(order.n || "0");
    const leverage = parseFloat(order.l || "0");

    console.log(`[BINANCE_FUTURES] Processing order: ${orderId}`, {
      symbol: order.s,
      side: order.S,
      type: order.ot,
      status: tradeStatus,
      requestedQty: order.q,
      filledQty,
    });

    // Step 1: Find or create local order
    let localOrder = await prisma.cryptoOrder.findFirst({
      where: {
        exchangeOrderId: orderId,
        userId,
        exchange: CryptoExchange.BINANCE,
      },
    });

    if (!localOrder) {
      console.log(`[BINANCE_FUTURES] Creating new local order: ${orderId}`);
      localOrder = await prisma.cryptoOrder.create({
        data: {
          userId,
          exchange: CryptoExchange.BINANCE,
          type: CryptoTradeType.FUTURES,
          symbol: order.s,
          side: order.S,
          orderType: order.ot,
          requestedQty: parseFloat(order.q || "0"),
          requestedPrice: parseFloat(order.p || "0"),
          filledQty,
          status: tradeStatus,
          exchangeOrderId: orderId,
          leverage,
        },
      });
    } else if (
      tradeStatusPriority[tradeStatus] > tradeStatusPriority[localOrder.status]
    ) {
      console.log(`[BINANCE_FUTURES] Updating local order status: ${orderId}`, {
        oldStatus: localOrder.status,
        newStatus: tradeStatus,
      });
      await prisma.cryptoOrder.update({
        where: { id: localOrder.id },
        data: { status: tradeStatus, filledQty },
      });
    }

    // Step 2: Find or create trade
    let existingTrade = await prisma.cryptoTrades.findFirst({
      where: {
        orderId: localOrder.id,
        userId,
        exchange: CryptoExchange.BINANCE,
      },
    });

    let shouldApplyPnL = false;
    const executedStatuses = ["EXECUTED", "PARTIALLY_FILLED"] as const;
    const isExecutable =
      tradeStatus === TradeStatus.EXECUTED ||
      tradeStatus === TradeStatus.PARTIALLY_FILLED;

    if (!existingTrade && isExecutable) {
      // Create new trade
      existingTrade = await prisma.cryptoTrades.create({
        data: {
          userId,
          exchange: CryptoExchange.BINANCE,
          type: CryptoTradeType.FUTURES,
          symbol: order.s,
          side: order.S,
          orderType: order.ot,
          orderId: localOrder.id,
          quantity: parseFloat(order.q || "0"),
          price: tradePrice,
          fee,
          status: tradeStatus,
          leverage,
        },
      });
      shouldApplyPnL = executedStatuses.includes(
        tradeStatus as (typeof executedStatuses)[number]
      );
      console.log(`[BINANCE_FUTURES] Created new trade: ${existingTrade.id}`, {
        status: tradeStatus,
        quantity: order.q,
        price: tradePrice,
      });
    } else if (
      tradeStatusPriority[tradeStatus] >
      tradeStatusPriority[existingTrade.status]
    ) {
      const prevStatus = existingTrade.status;
      await prisma.cryptoTrades.update({
        where: { id: existingTrade.id },
        data: { status: tradeStatus, price: tradePrice, fee },
      });

      shouldApplyPnL =
        !executedStatuses.includes(
          prevStatus as (typeof executedStatuses)[number]
        ) &&
        executedStatuses.includes(
          tradeStatus as (typeof executedStatuses)[number]
        );

      console.log(
        `[BINANCE_FUTURES] Updated existing trade: ${existingTrade.id}`,
        {
          oldStatus: prevStatus,
          newStatus: tradeStatus,
          quantity: order.q,
          price: tradePrice,
        }
      );
    }

    if (shouldApplyPnL) {
      console.log(
        `[BINANCE_FUTURES] Applying PnL for trade: ${existingTrade.id}`
      );
      await applyFuturesTradeExecution({
        userId,
        exchange: CryptoExchange.BINANCE,
        symbol: order.s,
        side: order.S,
        quantity: parseFloat(order.q || "0"),
        price: tradePrice,
        fee,
        tradeId: existingTrade.id,
      });
    }
  } catch (err) {
    console.error(
      `[BINANCE_FUTURES] ERROR updating trade for order ${order.i}`,
      {
        error: err,
        order,
      }
    );
  }
}
export async function handleFilledBinanceFuturesOrder(
  userId: string,
  order: any,
  credentials: any
) {
  try {
    if (!order.i) return;

    const orderId = order.i.toString();
    const tradeStatus = mapBinanceFutureOrderStatus(order.X);
    const tradePrice = parseFloat(order.ap || order.p || "0");
    const filledQty = parseFloat(order.z || "0");
    const fee = parseFloat(order.n || "0");
    const leverage = parseFloat(order.l || "0");

    console.log(`[BINANCE_FUTURES] Processing order: ${orderId}`, {
      symbol: order.s,
      side: order.S,
      type: order.ot,
      status: tradeStatus,
      requestedQty: order.q,
      filledQty,
    });

    // Step 1: Find or create local order
    let localOrder = await prisma.cryptoOrder.findFirst({
      where: {
        exchangeOrderId: orderId,
        userId,
        exchange: CryptoExchange.BINANCE,
      },
    });

    if (!localOrder) {
      console.log(`[BINANCE_FUTURES] Creating new local order: ${orderId}`);
      localOrder = await prisma.cryptoOrder.create({
        data: {
          userId,
          exchange: CryptoExchange.BINANCE,
          type: CryptoTradeType.FUTURES,
          symbol: order.s,
          side: order.S,
          orderType: order.ot,
          requestedQty: parseFloat(order.q || "0"),
          requestedPrice: parseFloat(order.p || "0"),
          filledQty,
          status: tradeStatus,
          exchangeOrderId: orderId,
          leverage,
        },
      });
    } else if (
      tradeStatusPriority[tradeStatus] > tradeStatusPriority[localOrder.status]
    ) {
      console.log(`[BINANCE_FUTURES] Updating local order status: ${orderId}`, {
        oldStatus: localOrder.status,
        newStatus: tradeStatus,
      });
      await prisma.cryptoOrder.update({
        where: { id: localOrder.id },
        data: { status: tradeStatus, filledQty },
      });
    }

    // Step 2: Find or create trade
    let existingTrade = await prisma.cryptoTrades.findFirst({
      where: {
        orderId: localOrder.id,
        userId,
        exchange: CryptoExchange.BINANCE,
      },
    });

    let shouldApplyPnL = false;
    const executedStatuses = ["EXECUTED", "PARTIALLY_FILLED"] as const;
    const isExecutable =
      tradeStatus === TradeStatus.EXECUTED ||
      tradeStatus === TradeStatus.PARTIALLY_FILLED;

    if (!existingTrade && isExecutable) {
      // Create new trade
      existingTrade = await prisma.cryptoTrades.create({
        data: {
          userId,
          exchange: CryptoExchange.BINANCE,
          type: CryptoTradeType.FUTURES,
          symbol: order.s,
          side: order.S,
          orderType: order.ot,
          orderId: localOrder.id,
          quantity: parseFloat(order.q || "0"),
          price: tradePrice,
          fee,
          status: tradeStatus,
          leverage,
        },
      });
      shouldApplyPnL = executedStatuses.includes(
        tradeStatus as (typeof executedStatuses)[number]
      );
      console.log(`[BINANCE_FUTURES] Created new trade: ${existingTrade.id}`, {
        status: tradeStatus,
        quantity: order.q,
        price: tradePrice,
      });
    } else if (
      tradeStatusPriority[tradeStatus] >
      tradeStatusPriority[existingTrade.status]
    ) {
      const prevStatus = existingTrade.status;
      await prisma.cryptoTrades.update({
        where: { id: existingTrade.id },
        data: { status: tradeStatus, price: tradePrice, fee },
      });

      shouldApplyPnL =
        !executedStatuses.includes(
          prevStatus as (typeof executedStatuses)[number]
        ) &&
        executedStatuses.includes(
          tradeStatus as (typeof executedStatuses)[number]
        );

      console.log(
        `[BINANCE_FUTURES] Updated existing trade: ${existingTrade.id}`,
        {
          oldStatus: prevStatus,
          newStatus: tradeStatus,
          quantity: order.q,
          price: tradePrice,
        }
      );
    }

    if (shouldApplyPnL) {
      console.log(
        `[BINANCE_FUTURES] Applying PnL for trade: ${existingTrade.id}`
      );
      await applyFuturesTradeExecution({
        userId,
        exchange: CryptoExchange.BINANCE,
        symbol: order.s,
        side: order.S,
        quantity: parseFloat(order.q || "0"),
        price: tradePrice,
        fee,
        tradeId: existingTrade.id,
      });
    }
  } catch (err) {
    console.error(
      `[BINANCE_FUTURES] ERROR updating trade for order ${order.i}`,
      {
        error: err,
        order,
      }
    );
  }
}

export async function handleBinanceFutureOrderUpdate(
  order: any,
  userId: string,
  credentials: {
    apiKey: string;
    apiSecret: string;
  }
): Promise<void> {
  const status = order.X;

  // if (status === "REJECTED") return;
  // if (status === "NEW" && (order.ot === "MARKET" || order.ot === "LIMIT"))
  //   return;

  try {
    console.log("PROCESSING_BINANCE_FUTURES_WEBSOCKET_MESSAGE", {
      data: order,
    });
    enqueueBinanceFuturesUpdate(userId, order, credentials);
  } catch (error) {
    console.log("ERROR_UPDATING_BINANCE_TRADE_STATUS", { error });
  }
}
