import { randomUUID } from "crypto";
import { Strategy } from "@prisma/client";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { StockMarketDataManager } from "../../sockets/stocks/marketData/marketDataManager";
import { computeNextRunAt } from "../../utils/scheduler/computeNextRunAt";
import prisma from "../../config/db.config";
import { tradeDispatcher } from "../../services/strategies/tradeDispatcher";
import { formatQuantity } from "../../utils/crypto/exchange/quantityFormatter";
import { evaluateGrowthDCA } from "../../services/strategies/evaluators/growthDcaEvaluator";
import { exitMonitor } from "../monitors/exitMonitor";

type GrowthDCAState = {
  investedCapital: number;
  entries: {
    id: string;
    quantity: number;
    entryPrice: number;
    takeProfitPrice: number;
    stopLossPrice: number;
  }[];
  lastExecutionAt: number | null;
  nextRunAt: Date | null;
  pendingOrder?: boolean;
};

// In-memory registry of active signal strategies
const registeredStrategies: Map<
  string,
  { strategy: Strategy; state?: GrowthDCAState }
> = new Map();

export const signalEngine = {
  register(strategy: Strategy) {
    console.log("[SIGNAL_ENGINE_REGISTER]", {
      strategyId: strategy.id,
      type: strategy.type,
    });
    if (registeredStrategies.has(strategy.id)) return;

    const state: GrowthDCAState | undefined =
      strategy.type === "GROWTH_DCA"
        ? {
            investedCapital: 0,
            entries: [],
            lastExecutionAt: strategy.lastExecutedAt?.getTime() || null,
            nextRunAt: computeNextRunAt(
              (strategy.config as any).schedule,
              strategy.lastExecutedAt || new Date(0),
            ),
          }
        : undefined;

    registeredStrategies.set(strategy.id, { strategy, state });

    const { assetType, exchange, segment, symbol, userId } = strategy as any;

    if (assetType === "CRYPTO") {
      MarketDataManager.subscribe(exchange, segment, symbol, strategy.id);
    } else if (assetType === "STOCK") {
      StockMarketDataManager.subscribe(exchange, userId, symbol, strategy.id);
    }
  },

  unregister(strategyId: string) {
    const record = registeredStrategies.get(strategyId);
    if (!record) return;

    const { strategy } = record;
    const { assetType, exchange, segment, symbol, userId } = strategy as any;

    if (assetType === "CRYPTO") {
      MarketDataManager.unsubscribe(exchange, segment, symbol, strategyId);
    } else if (assetType === "STOCK") {
      StockMarketDataManager.unsubscribe(exchange, userId, symbol, strategyId);
    }

    registeredStrategies.delete(strategyId);
    console.log("[SIGNAL_ENGINE_UNREGISTER]", { strategyId });
  },

  // Called on market tick
  async onMarketTick(strategyId: string, price: number, timestamp: number) {
    const record = registeredStrategies.get(strategyId);
    if (!record) return;

    const { strategy, state } = record;
    if (!state || strategy.type !== "GROWTH_DCA") return;

    // Skip if pending
    if (state.pendingOrder) {
      console.log("[SIGNAL_ENGINE_SKIP_PENDING]", { strategyId });
      return;
    }

    // Check scheduled time
    if (!state.nextRunAt) {
      state.nextRunAt = computeNextRunAt(
        (strategy.config as any).schedule,
        state.lastExecutionAt ? new Date(state.lastExecutionAt) : new Date(0),
      );
    }

    if (timestamp < state.nextRunAt.getTime()) return;

    console.log("[SIGNAL_ENGINE_TICK]", {
      strategyId,
      price,
      timestamp,
    });
    // Investment cap
    const config = strategy.config as any;
    if (
      state.investedCapital + config.capital.perOrderAmount >
      config.capital.maxCapital
    )
      return;

    if (!price || price <= 0) return;

    // Evaluate decision
    const decision = evaluateGrowthDCA(strategy, state, price, timestamp);
    if (decision !== "BUY") {
      console.log("[SIGNAL_ENGINE_HOLD]", { strategyId, decision });

      // Check SELL conditions
      for (const entry of state.entries) {
        if (config.exit.bookProfit.enabled && price >= entry.takeProfitPrice) {
          return executeSell(strategy, state, entry, price, "BOOK_PROFIT");
        }
        if (config.risk.stopLoss.enabled && price <= entry.stopLossPrice) {
          return executeSell(strategy, state, entry, price, "STOP_LOSS");
        }
      }
      return;
    }

    // Execute BUY
    const perOrder = config.capital.perOrderAmount;
    const qty = await formatQuantity({
      exchange: strategy.exchange,
      tradeType: strategy.segment,
      symbol: strategy.symbol,
      rawQty: perOrder / price,
    });

    const takeProfitPrice = config.exit.bookProfit.enabled
      ? price * (1 + config.exit.bookProfit.percentage / 100)
      : 0;
    const stopLossPrice = config.risk.stopLoss.enabled
      ? price * (1 - config.risk.stopLoss.percentage / 100)
      : 0;

    const entry = {
      id: randomUUID(),
      quantity: qty,
      entryPrice: price,
      takeProfitPrice,
      stopLossPrice,
    };

    state.entries.push(entry);
    state.investedCapital += perOrder;
    state.lastExecutionAt = timestamp;
    state.pendingOrder = true;
    state.nextRunAt = computeNextRunAt(config.schedule, new Date(timestamp));

    await prisma.strategy.update({
      where: { id: strategy.id },
      data: { lastExecutedAt: new Date(state.lastExecutionAt) },
    });
    console.log("[SIGNAL_ENGINE_BUY]", {
      strategyId,
      price,
      quantity: qty,
    });

    tradeDispatcher.dispatch({
      userId: strategy.userId,
      exchange: strategy.exchange,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: strategy.segment as any,
      symbol: strategy.symbol,
      side: "BUY",
      quantity: qty,
      price,
      orderType: "MARKET",
      strategyId: strategy.id,
      takeProfit: takeProfitPrice,
      stopLoss: stopLossPrice,

      onComplete: () => {
        state.pendingOrder = false;
      },
    });
   await exitMonitor.trackPosition(strategy.id, {
      tradeId: strategy.id + "-" + Date.now(), // unique id
      userId: strategy.userId,
      symbol: strategy.symbol,
      side: "BUY",
      entryPrice: price,
      quantity: qty,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      exchange: strategy.exchange,
      tradeType: strategy.segment as any,
      takeProfit: takeProfitPrice,
      stopLoss: stopLossPrice,
    });
  },
};

// -------------------- Helper SELL function --------------------
async function executeSell(
  strategy: Strategy,
  state: GrowthDCAState,
  entry: GrowthDCAState["entries"][number],
  price: number,
  reason: "BOOK_PROFIT" | "STOP_LOSS",
) {
  state.pendingOrder = true;
  console.log("[SIGNAL_ENGINE_SELL]", {
    strategyId: strategy.id,
    reason,
    price,
  });

  tradeDispatcher.dispatch({
    userId: strategy.userId,
    exchange: strategy.exchange,
    segment: strategy.assetType as "CRYPTO" | "STOCK",
    tradeType: strategy.segment as any,
    symbol: strategy.symbol,
    side: "SELL",
    quantity: entry.quantity,
    price,
    orderType: "MARKET",
    strategyId: strategy.id,
    onComplete: () => {
      state.entries = state.entries.filter((e) => e.id !== entry.id);
      state.investedCapital -= entry.quantity * entry.entryPrice;
      state.pendingOrder = false;
    },
  });
}
