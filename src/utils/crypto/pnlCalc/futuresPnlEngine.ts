import { CryptoExchange } from "@prisma/client";
import prisma from "../../../config/db.config";

export async function applyFuturesTradeExecution(trade: {
  userId: string;
  exchange: CryptoExchange;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fee: number;
  tradeId: string;
}) {
  const tradeQty = trade.side === "BUY" ? trade.quantity : -trade.quantity;

  let position = await prisma.futuresPosition.findUnique({
    where: {
      userId_exchange_symbol: {
        userId: trade.userId,
        exchange: trade.exchange,
        symbol: trade.symbol,
      },
    },
  });

  if (!position) {
    // No existing position → open new
    await prisma.futuresPosition.create({
      data: {
        userId: trade.userId,
        exchange: trade.exchange,
        symbol: trade.symbol,
        qty: tradeQty,
        avgEntryPrice: trade.price,
        realizedPnl: 0,
      },
    });

    return;
  }

  let realizedPnl = 0;
  const sameDirection = Math.sign(position.qty) === Math.sign(tradeQty);

  if (sameDirection) {
    // Increasing position
    const totalQty = Math.abs(position.qty) + Math.abs(tradeQty);
    const newAvg =
      (Math.abs(position.qty) * position.avgEntryPrice +
        Math.abs(tradeQty) * trade.price) /
      totalQty;

    await prisma.futuresPosition.update({
      where: { id: position.id },
      data: {
        qty: position.qty + tradeQty,
        avgEntryPrice: newAvg,
      },
    });
  } else {
    // Closing or reversing
    const closedQty = Math.min(
      Math.abs(position.qty),
      Math.abs(tradeQty)
    );

    if (position.qty > 0) {
      // closing LONG
      realizedPnl =
        (trade.price - position.avgEntryPrice) * closedQty;
    } else {
      // closing SHORT
      realizedPnl =
        (position.avgEntryPrice - trade.price) * closedQty;
    }

    const remainingQty = position.qty + tradeQty;

    if (remainingQty === 0) {
      // Fully closed
      await prisma.futuresPosition.update({
        where: { id: position.id },
        data: {
          qty: 0,
          avgEntryPrice: 0,
          realizedPnl: position.realizedPnl + realizedPnl,
        },
      });
    } else if (Math.sign(remainingQty) !== Math.sign(position.qty)) {
      // Reversal
      await prisma.futuresPosition.update({
        where: { id: position.id },
        data: {
          qty: remainingQty,
          avgEntryPrice: trade.price,
          realizedPnl: position.realizedPnl + realizedPnl,
        },
      });
    } else {
      // Partial close
      await prisma.futuresPosition.update({
        where: { id: position.id },
        data: {
          qty: remainingQty,
          realizedPnl: position.realizedPnl + realizedPnl,
        },
      });
    }
  }

  await prisma.cryptoTrades.update({
    where: { id: trade.tradeId },
    data: { realizedPnl },
  });
}
