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

    // ✅ LOCK execution type - NEVER mutate
    const lockedIntent = {
      ...originalIntent,
      tradeType: originalIntent.tradeType, // Explicitly preserve
      segment: originalIntent.segment,     // Lock segment
    };

    // 1️⃣ Execute for strategy owner
    await this.dispatchForUser({ ...lockedIntent });

    // 2️⃣ Copy trading
    if (!lockedIntent.strategyId) return;
    
    const strategy = await prisma.strategy.findUnique({
      where: { id: lockedIntent.strategyId },
      select: { executionMode: true },
    });

    if (strategy?.executionMode !== "PUBLISHED") {
      console.log(
        "Cannot execute strategy as the executionMode is:",
        strategy?.executionMode,
      );
      return;
    }

    const followers = await prisma.strategyCopySubscription.findMany({
      where: {
        strategyId: lockedIntent.strategyId,
        isActive: true,
      },
    });

    await Promise.allSettled(
      followers.map(async (follower) => {
        if (follower.followerUserId === lockedIntent.userId) return;

        const qty = lockedIntent.quantity * follower.multiplier;
        if (qty <= 0) return;

        const exchange = follower.followerExchange?.trim()
          ? follower.followerExchange
          : lockedIntent.exchange;

        return this.dispatchForUser({
          ...lockedIntent, // ✅ Use locked intent
          userId: follower.followerUserId,
          exchange,
          quantity: qty,
          onComplete: undefined,
          isCopyTrade: true,
        });
      }),
    );
  },

  async dispatchForUser(intent: TradeIntent) {
    // ✅ Validate execution type hasn't been mutated
    if (intent.segment === "CRYPTO" && !["SPOT", "FUTURES"].includes(intent.tradeType || "")) {
      console.error("[DISPATCHER] Invalid trade type", {
        segment: intent.segment,
        tradeType: intent.tradeType,
        userId: intent.userId,
      });
      return;
    }

    if (intent.segment === "CRYPTO") {
      const user = await prisma.cryptoUser.findUnique({
        where: { id: intent.userId },
        select: { role: true },
      });

      let executionType = intent.executionType;
      if (intent.isCopyTrade) {
        executionType = user?.role?.name === "SLAVE_PRO" ? "LIVE" : "PAPER";
      }

      const raw = await getCryptoCredentials(intent.userId, intent.exchange);
      const credentials = Array.isArray(raw) ? raw[0] : raw;
      if (!credentials) return;

      // ✅ Lock trade type in execution
      tradeExecutionEngine.enqueue({
        ...intent,
        tradeType: intent.tradeType, // Preserve original
        executionType,
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
        executionType,
        credentials,
      });
      return;
    }
  },
};
