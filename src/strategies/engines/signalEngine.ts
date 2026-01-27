import { randomUUID } from "crypto";
import { Strategy } from "@prisma/client";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { StockMarketDataManager } from "../../sockets/stocks/marketData/marketDataManager";
import { computeNextRunAt } from "../../utils/scheduler/computeNextRunAt";
import prisma from "../../config/db.config";
import { tradeDispatcher } from "../../services/strategies/tradeDispatcher";
import { formatQuantity } from "../../utils/crypto/exchange/quantityFormatter";
import { evaluateGrowthDCA } from "../../services/strategies/evaluators/growthDcaEvaluator";
import { evaluateHumanGrid } from "../../services/strategies/evaluators/humanGridEvaluator";
import { exitMonitor } from "../monitors/exitMonitor";
import { HumanGridState } from "../../types/strategies/humanGrid.types";

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

type StrategyState = GrowthDCAState | HumanGridState;

const registeredStrategies: Map<
  string,
  { strategy: Strategy; state?: StrategyState }
> = new Map();

export const signalEngine = {
  async register(strategy: Strategy) {
    console.log("[SIGNAL_ENGINE_REGISTER]", {
      strategyId: strategy.id,
      type: strategy.type,
    });
    
    if (registeredStrategies.has(strategy.id)) return;

    let state: StrategyState | undefined;

    if (strategy.type === "GROWTH_DCA") {
      state = {
        investedCapital: 0,
        entries: [],
        lastExecutionAt: strategy.lastExecutedAt?.getTime() || null,
        nextRunAt: computeNextRunAt(
          (strategy.config as any).schedule,
          strategy.lastExecutedAt || new Date(0),
        ),
      } as GrowthDCAState;
    } else if (strategy.type === "HUMAN_GRID") {
      const gridConfig = strategy.config as any;
      state = {
        grids: gridConfig.grids || [],
        investedCapital: 0,
        lastExecutionAt: null,
        status: "ACTIVE",
        pendingOrders: new Set<string>(),
      } as HumanGridState;
    }

    registeredStrategies.set(strategy.id, { strategy, state });

    const { assetType, exchange, segment, symbol, userId } = strategy as any;

    if (assetType === "CRYPTO") {
      MarketDataManager.subscribe(exchange, segment, symbol, strategy.id);
    } else if (assetType === "STOCK") {
      StockMarketDataManager.subscribe(exchange, userId, symbol, strategy.id);
    }

    // ✅ NEW: Immediate grid evaluation for Human Grid strategies
    if (strategy.type === "HUMAN_GRID") {
      await this.performInitialGridEvaluation(strategy, state as HumanGridState);
    }
  },

  // ✅ NEW: Initial grid evaluation
  async performInitialGridEvaluation(strategy: Strategy, state: HumanGridState) {
    try {
      const { assetType, exchange, segment, symbol, userId } = strategy as any;
      
      // Fetch current market price
      let currentPrice: number | null = null;

      if (assetType === "CRYPTO") {
        currentPrice = MarketDataManager.getLastPrice(exchange, segment, symbol);
        if (!currentPrice || currentPrice <= 0) {
          currentPrice = await MarketDataManager.fetchMarketPrice(exchange, segment, symbol);
        }
      } else if (assetType === "STOCK") {
        currentPrice = StockMarketDataManager.getLastPrice(exchange, userId, symbol);
        if (!currentPrice || currentPrice <= 0) {
          currentPrice = await StockMarketDataManager.fetchMarketPrice(exchange, userId, symbol);
        }
      }

      if (!currentPrice || currentPrice <= 0) {
        console.warn("[HUMAN_GRID_INIT] Unable to fetch market price", {
          strategyId: strategy.id,
          symbol,
        });
        return;
      }

      const config = strategy.config as any;

      console.log("[HUMAN_GRID_INIT] Initial evaluation", {
        strategyId: strategy.id,
        symbol,
        currentPrice,
        lowerLimit: config.lowerLimit,
        upperLimit: config.upperLimit,
        gridCount: state.grids.length,
      });

      // Check if price is within grid range
      if (currentPrice >= config.lowerLimit && currentPrice <= config.upperLimit) {
        console.log("[HUMAN_GRID_INIT] Price within grid range, evaluating...");
        await handleHumanGrid(strategy, state, currentPrice, Date.now());
      } else {
        console.log("[HUMAN_GRID_INIT] Price outside grid range", {
          currentPrice,
          range: `${config.lowerLimit} - ${config.upperLimit}`,
        });
      }
    } catch (error) {
      console.error("[HUMAN_GRID_INIT] Error during initial evaluation", {
        strategyId: strategy.id,
        error: (error as any).message,
      });
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

  async onMarketTick(strategyId: string, price: number, timestamp: number) {
    const record = registeredStrategies.get(strategyId);
    if (!record || !record.state) return;

    const { strategy, state } = record;

    if (strategy.type === "GROWTH_DCA") {
      await handleGrowthDCA(strategy, state as GrowthDCAState, price, timestamp);
    } else if (strategy.type === "HUMAN_GRID") {
      await handleHumanGrid(strategy, state as HumanGridState, price, timestamp);
    }
  },
};

// ✅ Growth DCA Handler (unchanged)
async function handleGrowthDCA(
  strategy: Strategy,
  state: GrowthDCAState,
  price: number,
  timestamp: number
) {
  if (state.pendingOrder) return;

  if (!state.nextRunAt) {
    state.nextRunAt = computeNextRunAt(
      (strategy.config as any).schedule,
      state.lastExecutionAt ? new Date(state.lastExecutionAt) : new Date(0),
    );
  }

  if (timestamp < state.nextRunAt.getTime()) return;

  const config = strategy.config as any;
  if (
    state.investedCapital + config.capital.perOrderAmount >
    config.capital.maxCapital
  )
    return;

  if (!price || price <= 0) return;

  const decision = evaluateGrowthDCA(strategy, state, price, timestamp);
  
  if (decision !== "BUY") {
    for (const entry of state.entries) {
      if (config.exit.bookProfit.enabled && price >= entry.takeProfitPrice) {
        return executeSellGrowthDCA(strategy, state, entry, price, "BOOK_PROFIT");
      }
      if (config.risk.stopLoss.enabled && price <= entry.stopLossPrice) {
        return executeSellGrowthDCA(strategy, state, entry, price, "STOP_LOSS");
      }
    }
    return;
  }

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
    tradeId: strategy.id + "-" + Date.now(),
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
}

async function executeSellGrowthDCA(
  strategy: Strategy,
  state: GrowthDCAState,
  entry: GrowthDCAState["entries"][number],
  price: number,
  reason: "BOOK_PROFIT" | "STOP_LOSS",
) {
  state.pendingOrder = true;

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

// ✅ Human Grid Handler
async function handleHumanGrid(
  strategy: Strategy,
  state: HumanGridState,
  price: number,
  timestamp: number
) {
  const config = strategy.config as any;

  console.log("[HUMAN_GRID_TICK]", {
    strategyId: strategy.id,
    price,
    lowerLimit: config.lowerLimit,
    upperLimit: config.upperLimit,
    timestamp: new Date(timestamp).toISOString(),
    activeGrids: state.grids.filter(g => g.status === "EMPTY").length,
    filledGrids: state.grids.filter(g => g.status === "BOUGHT").length,
    pendingOrders: state.pendingOrders.size,
    investedCapital: state.investedCapital,
  });

  const decision = evaluateHumanGrid(strategy, state, price);

  if (decision.action === "HOLD") {
    console.log("[HUMAN_GRID_HOLD]", {
      strategyId: strategy.id,
      reason: decision.reason,
      price,
    });
    return;
  }

  // Handle BUY
  if (decision.action === "BUY" && decision.gridId) {
    const potentialInvestment = state.investedCapital + config.capital.perGridAmount;
    if (potentialInvestment > config.capital.maxCapital) {
      console.log("[HUMAN_GRID] Investment cap reached");
      return;
    }

    state.pendingOrders.add(decision.gridId);

    const stopLossPrice = config.stopLossPercentage
      ? price * (1 - config.stopLossPercentage / 100)
      : undefined;

    const qty = await formatQuantity({
      exchange: strategy.exchange,
      tradeType: strategy.segment,
      symbol: strategy.symbol,
      rawQty: strategy.assetType === "STOCK" 
        ? config.capital.perGridAmount 
        : config.capital.perGridAmount / price,
    });

    console.log("[HUMAN_GRID_BUY]", {
      strategyId: strategy.id,
      gridId: decision.gridId,
      buyPrice: decision.price,
      quantity: qty,
      targetSellPrice: decision.price! + config.bookProfitBy,
      stopLoss: stopLossPrice,
    });

    await tradeDispatcher.dispatch({
      userId: strategy.userId,
      exchange: strategy.exchange,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: strategy.segment as "SPOT" | "FUTURES",
      symbol: strategy.symbol,
      side: "BUY",
      quantity: qty,
      price: decision.price!,
      takeProfit: decision.price! + config.bookProfitBy,
      stopLoss: stopLossPrice,
      orderType: "LIMIT",
      strategyId: strategy.id,
      onComplete: () => {
        const grid = state.grids.find((g) => g.id === decision.gridId);
        if (grid) {
          grid.status = "BOUGHT";
          grid.quantity = qty;
          state.investedCapital += config.capital.perGridAmount;
        }
        state.pendingOrders.delete(decision.gridId!);
        state.lastExecutionAt = timestamp;

        console.log("[HUMAN_GRID_BUY_COMPLETE]", {
          strategyId: strategy.id,
          gridId: decision.gridId,
          investedCapital: state.investedCapital,
        });
      },
    });
  }

  // Handle SELL
  if (decision.action === "SELL" && decision.gridId) {
    state.pendingOrders.add(decision.gridId);

    console.log("[HUMAN_GRID_SELL]", {
      strategyId: strategy.id,
      gridId: decision.gridId,
      sellPrice: decision.price,
      quantity: decision.quantity,
    });

    await tradeDispatcher.dispatch({
      userId: strategy.userId,
      exchange: strategy.exchange,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: strategy.segment as "SPOT" | "FUTURES",
      symbol: strategy.symbol,
      side: "SELL",
      quantity: decision.quantity!,
      price: decision.price!,
      orderType: "LIMIT",
      strategyId: strategy.id,
      onComplete: () => {
        const grid = state.grids.find((g) => g.id === decision.gridId);
        if (grid) {
          grid.status = "EMPTY";
          grid.quantity = 0;
          state.investedCapital -= config.capital.perGridAmount;
        }
        state.pendingOrders.delete(decision.gridId!);
        state.lastExecutionAt = timestamp;

        console.log("[HUMAN_GRID_SELL_COMPLETE]", {
          strategyId: strategy.id,
          gridId: decision.gridId,
          investedCapital: state.investedCapital,
        });
      },
    });
  }
}