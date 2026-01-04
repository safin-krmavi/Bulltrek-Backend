import { StocksExchange, TradeSide, TradeStatus } from "@prisma/client";
import prisma from "../../../config/db.config";
import { mapKotakOrderStatus } from "../../../constants/stocks/exchange/kotak";
import { tradeStatusPriority } from "../../../constants/crypto";

export async function handleKotakOrderUpdate(message: any, userId: string) {
  /**
   * order.ordSt (order status):
   * complete | rejected | cancelled | open | trigger_pending
   */

  try {
    if (message.type !== "order") return;

    const data = message.data;
    console.log("PROCESSING_KOTAK_ORDER", {
      userId,
      message,
      orderId: data.nOrdNo,
      status: data.ordSt,
      symbol: data.trdSym,
      quantity: data.qty,
      filledQuantity: data.fldQty,
      price: data.prc,
    });

    const exchangeOrderId = data.nOrdNo?.toString();
    if (!exchangeOrderId) return;

    const tradeStatus = mapKotakOrderStatus(data.ordSt);

    const side = data.trnsTp === "B" ? TradeSide.BUY : TradeSide.SELL;

    const symbol = data.trdSym || data.sym;
    const requestedQty = Number(data.qty || 0);
    const filledQty = Number(data.fldQty || 0);
    const requestedPrice = Number(data.prc || 0);
    const avgPrice = Number(data.avgPrc || 0);

    // Step 1: find or create order
    let localOrder = await prisma.stocksOrder.findFirst({
      where: {
        exchangeOrderId,
        userId,
        exchange: StocksExchange.KOTAK,
      },
    });

    if (!localOrder) {
      localOrder = await prisma.stocksOrder.create({
        data: {
          userId,
          exchange: StocksExchange.KOTAK,
          type: data.series,
          symbol,
          side,
          exchangeOrderId,
          requestedQty,
          requestedPrice,
          orderType: data.prcTp === "L" ? "LIMIT" : "MARKET",
          status: tradeStatus,
          filledQty,
          //   rejectionReason: data.rejRsn || null,
        },
      });
    } else {
      // Update only if status progressed
      if (
        tradeStatusPriority[tradeStatus] >
        tradeStatusPriority[localOrder.status]
      ) {
        await prisma.stocksOrder.update({
          where: { id: localOrder.id },
          data: {
            status: tradeStatus,
            filledQty,
            // rejectionReason: data.rejRsn || null,
          },
        });
      }
    }

    // Step 2: DO NOT create trade here
    // Kotak sends trades via separate `type: "trade"` messages

    if (tradeStatus === TradeStatus.REJECTED) {
      console.warn("[KOTAK][ORDER_REJECTED]", {
        userId,
        exchangeOrderId,
        reason: data.rejRsn,
      });
    }
  } catch (err) {
    console.error("ERROR_PROCESSING_KOTAK_ORDER", {
      error: err,
      message,
    });
  }

  // 1. Update DB order record
  // 2. Match strategyId if linked
  // 3. Trigger strategyRuntimeRegistry if needed
}

export function handleKotakTradeUpdate(trade: any, userId: string) {
  console.log("PROCESSING_KOTAK_TRADE", {
    userId,
    tradeId: trade.flId,
    orderId: trade.nOrdNo,
    symbol: trade.trdSym,
    quantity: trade.fldQty,
    price: trade.avgPrc,
    transactionType: trade.trnsTp,
  });

  // 1. Update filled quantity in DB
  // 2. Recalculate PnL
  // 3. Notify frontend or strategy runtime
}
