import prisma from "../config/db.config";
import { createNotification } from "../services/strategies/notificationService";
import { TradeIntent } from "../services/strategies/tradeDispatcher";

export async function handleExpiredSession(intent: TradeIntent, err: any) {
  if (err.message !== "STOCKS_SESSION_EXPIRED") return;

  // 1️⃣ Pause the strategy (if trade is strategy-driven)
  if (intent.strategyId) {
    await prisma.strategy.updateMany({
      where: {
        userId: intent.userId,
        exchange: intent.exchange,
        assetType: "STOCK",
        status: "ACTIVE",
      },
      data: {
        status: "PAUSED",
      },
    });
  }
  await prisma.notification.create({
    data: {
      userId: intent.userId,
      type: "STOCKS_SESSION_EXPIRED",
      title: "Broker login required",
      message: `Your ${intent.exchange} session expired. Login to resume trading.`,
    },
  });

  console.warn("[STOCK_SESSION_EXPIRED]", {
    userId: intent.userId,
    exchange: intent.exchange,
    strategyId: intent.strategyId,
  });
}
