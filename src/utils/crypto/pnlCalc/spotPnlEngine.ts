import { CryptoExchange } from "@prisma/client";
import prisma from "../../../config/db.config";

export async function applySpotTradeExecution(trade: {
  userId: string;
  exchange: CryptoExchange;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fee: number;
  tradeId: string;
}) {
  let balance = await prisma.spotBalance.findUnique({
    where: {
      userId_exchange_asset: {
        userId: trade.userId,
        exchange: trade.exchange,
        asset: trade.asset,
      },
    },
  });

  if (!balance) {
    balance = await prisma.spotBalance.create({
      data: {
        userId: trade.userId,
        exchange: trade.exchange,
        asset: trade.asset,
        qty: 0,
        avgPrice: 0,
        realizedPnl: 0,
      },
    });
  }

  let realizedPnl = 0;

  if (trade.side === "BUY") {
    const totalQty = balance.qty + trade.quantity;
    const newAvg =
      (balance.qty * balance.avgPrice + trade.quantity * trade.price) /
      totalQty;

    await prisma.spotBalance.update({
      where: { id: balance.id },
      data: {
        qty: totalQty,
        avgPrice: newAvg,
      },
    });
  } else {
    // SELL
    realizedPnl = (trade.price - balance.avgPrice) * trade.quantity;

    const newQty = balance.qty - trade.quantity;

    await prisma.spotBalance.update({
      where: { id: balance.id },
      data: {
        qty: newQty,
        avgPrice: newQty === 0 ? 0 : balance.avgPrice,
        realizedPnl: balance.realizedPnl + realizedPnl,
      },
    });
  }

  await prisma.cryptoTrades.update({
    where: { id: trade.tradeId },
    data: { realizedPnl },
  });
}
