import prisma from "../../config/db.config";
import { handleExpiredSession } from "../../utils/strategyUtils";
import { getCryptoCredentials } from "../crypto/credentialsService";
import { getStocksCredentials } from "../stocks/credentialsService";
import { ensureValidStocksSession } from "./ensureValidStocksSession";
import { tradeExecutionEngine } from "./tradeExecutionEngine";

export type TradeIntent = {
  userId: string;
  exchange: any;
  segment: "CRYPTO" | "STOCK";
  tradeType?: "SPOT" | "FUTURES"; // crypto only
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  orderType: "MARKET" | "LIMIT";
  strategyId?: string;
  takeProfit?: number;
  stopLoss?: number;

  // injected by dispatcher
  credentials?: any;

  attempt?: number;
  onComplete?: () => void;

  // internal
  executionType?: "LIVE" | "PAPER";
  isCopyTrade?: boolean;
};

export const tradeDispatcher = {
  async dispatch(originalIntent: TradeIntent) {
    console.log(`[Dispatcher] Dispatching trade intent:`, originalIntent);

    // 1️⃣ Execute for strategy owner (clone to avoid mutation bleed)
    await this.dispatchForUser({ ...originalIntent });

    // 2️⃣ Copy trading only if strategyId exists
    if (!originalIntent.strategyId) return;

    const followers = await prisma.strategyCopySubscription.findMany({
      where: {
        strategyId: originalIntent.strategyId,
        isActive: true,
      },
    });

    for (const follower of followers) {
      // ❗ Skip owner to prevent double execution
      if (follower.followerUserId === originalIntent.userId) continue;

      const qty = originalIntent.quantity * follower.multiplier;

      // ❗ Never enqueue invalid quantities
      if (qty <= 0) continue;

      await this.dispatchForUser({
        ...originalIntent,
        userId: follower.followerUserId,
        quantity: qty,
        onComplete: undefined, // followers never mutate strategy state
        isCopyTrade: true,
      });
    }
  },

  async dispatchForUser(intent: TradeIntent) {
    if (intent.segment === "CRYPTO") {
      const user = await prisma.cryptoUser.findUnique({
        where: { id: intent.userId },
        select: { role: true },
      });

      let executionType = intent.executionType;
      if (intent.isCopyTrade) {
        executionType = user?.role?.name === "SLAVE_PRO" ? "LIVE" : "PAPER";
      }
      // if (executionType === "PAPER") {
      //   // Log paper trade instead of executing
      //   await this.recordPaperTrade(intent);
      //   return;
      // }

      const raw = await getCryptoCredentials(intent.userId, intent.exchange);
      const credentials = Array.isArray(raw) ? raw[0] : raw;
      if (!credentials) return;

      tradeExecutionEngine.enqueue({
        ...intent,
        credentials,
      });
      return;
    }

    if (intent.segment === "STOCK") {
      const user = await prisma.stocksUser.findUnique({
        where: { id: intent.userId },
        select: { role: true },
      });

      let executionType = intent.executionType;
      if (intent.isCopyTrade) {
        executionType = user?.role?.name === "SLAVE_PRO" ? "LIVE" : "PAPER";
      }
      // if (executionType === "PAPER") {
      //   // Log paper trade instead of executing
      //   await this.recordPaperTrade(intent);
      //   return;
      // }

      const raw = await getStocksCredentials(intent.userId, intent.exchange);
      const credentials = Array.isArray(raw) ? raw[0] : raw;
      if (!credentials) return;

      try {
        await ensureValidStocksSession({
          userId: intent.userId,
          exchange: intent.exchange,
        });
      } catch (err) {
        await handleExpiredSession(intent, err);
        return;
      }

      tradeExecutionEngine.enqueue({
        ...intent,
        credentials,
      });
      return;
    }
  },
};
