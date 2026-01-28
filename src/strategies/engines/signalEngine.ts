import { randomUUID } from "crypto";
import { Strategy } from "@prisma/client";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { StockMarketDataManager } from "../../sockets/stocks/marketData/marketDataManager";
import { computeNextRunAt } from "../../utils/scheduler/computeNextRunAt";
import prisma from "../../config/db.config";
import { tradeDispatcher } from "../../services/strategies/tradeDispatcher";
import { formatQuantity } from "../../utils/crypto/exchange/quantityFormatter";
import { evaluateGrowthDCA } from "../../services/strategies/evaluators/growthDcaEvaluator";
import { evaluateHumanGrid, evaluateSmartGrid } from "../../services/strategies/evaluators/humanGridEvaluator";
import { exitMonitor } from "../monitors/exitMonitor";
import { HumanGridState, SmartGridState } from "../../types/strategies/humanGrid.types";

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

type StrategyState = GrowthDCAState | HumanGridState | SmartGridState;

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
    } else if (strategy.type === "SMART_GRID") {
      const gridConfig = strategy.config as any;
      state = {
        grids: gridConfig.grids || [],
        investedCapital: 0,
        lastExecutionAt: null,
        lastRecalculationAt: null,
        status: "ACTIVE",
        pendingOrders: new Set<string>(),
        indicators: gridConfig.indicators || {
          bollingerUpper: 0,
          bollingerLower: 0,
          atr: 0,
        },
        mode: gridConfig.mode || "DYNAMIC",
      } as SmartGridState;
    }

    registeredStrategies.set(strategy.id, { strategy, state });

    const { assetType, exchange, segment, symbol, userId } = strategy as any;

    if (assetType === "CRYPTO") {``
      MarketDataManager.subscribe(exchange, segment, symbol, strategy.id);
    } else if (assetType === "STOCK") {
      StockMarketDataManager.subscribe(exchange, userId, symbol, strategy.id);
    }

    // Initial evaluation for grid strategies
    if (strategy.type === "HUMAN_GRID") {
      await this.performInitialGridEvaluation(strategy, state as HumanGridState);
    } else if (strategy.type === "SMART_GRID") {
      await this.performInitialSmartGridEvaluation(strategy, state as SmartGridState);
    }
  },

  // ✅ ADD: Unregister method
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
 
  // ✅ NEW: Initial Smart Grid evaluation
  async performInitialSmartGridEvaluation(strategy: Strategy, state: SmartGridState) {
    try {
      const { assetType, exchange, segment, symbol, userId } = strategy as any;
      
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
        console.warn("[SMART_GRID_INIT] Unable to fetch market price", {
          strategyId: strategy.id,
          symbol,
        });
        return;
      }

      const config = strategy.config as any;

      console.log("[SMART_GRID_INIT] Initial evaluation", {
        strategyId: strategy.id,
        symbol,
        currentPrice,
        lowerLimit: config.lowerLimit,
        upperLimit: config.upperLimit,
        gridCount: state.grids.length,
        mode: state.mode,
      });

      if (currentPrice >= config.lowerLimit && currentPrice <= config.upperLimit) {
        console.log("[SMART_GRID_INIT] Price within grid range, evaluating...");
        await handleSmartGrid(strategy, state, currentPrice, Date.now());
      } else {
        console.log("[SMART_GRID_INIT] Price outside grid range", {
          currentPrice,
          range: `${config.lowerLimit} - ${config.upperLimit}`,
        });
      }
    } catch (error) {
      console.error("[SMART_GRID_INIT] Error during initial evaluation", {
        strategyId: strategy.id,
        error: (error as any).message,
      });
    }
  },

  async performInitialGridEvaluation(strategy: Strategy, state: HumanGridState) {
    try {
      const { assetType, exchange, segment, symbol, userId } = strategy as any;
      
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

  async onMarketTick(strategyId: string, price: number, timestamp: number) {
    const record = registeredStrategies.get(strategyId);
    if (!record || !record.state) return;
    console.log("[SIGNAL_ENGINE_TICK]", { strategyId, price, timestamp });
    const { strategy, state } = record;

    if (strategy.type === "GROWTH_DCA") {
      await handleGrowthDCA(strategy, state as GrowthDCAState, price, timestamp);
    } else if (strategy.type === "HUMAN_GRID") {
      await handleHumanGrid(strategy, state as HumanGridState, price, timestamp);
    } else if (strategy.type === "SMART_GRID") {
      await handleSmartGrid(strategy, state as SmartGridState, price, timestamp);
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

// ✅ NEW: Smart Grid Bootstrap Handler
async function bootstrapSmartGrid(
  strategy: Strategy,
  state: SmartGridState,
  currentPrice: number,
  timestamp: number
) {
  const config = strategy.config as any;

  // ✅ CRITICAL: Validate price is within grid range
  if (currentPrice < config.lowerLimit || currentPrice > config.upperLimit) {
    console.error("[SMART_GRID_BOOTSTRAP] Price outside grid range - cannot bootstrap", {
      strategyId: strategy.id,
      currentPrice,
      lowerLimit: config.lowerLimit,
      upperLimit: config.upperLimit,
      deviation: currentPrice < config.lowerLimit 
        ? `${((config.lowerLimit - currentPrice) / currentPrice * 100).toFixed(2)}% below`
        : `${((currentPrice - config.upperLimit) / currentPrice * 100).toFixed(2)}% above`,
    });
    return;
  }

  console.log("[SMART_GRID_BOOTSTRAP] Starting initial order placement", {
    strategyId: strategy.id,
    currentPrice,
    gridCount: state.grids.length,
    range: `${config.lowerLimit} - ${config.upperLimit}`,
  });

  const sortedGrids = [...state.grids].sort((a, b) => a.buyPrice - b.buyPrice);
  let buyOrdersPlaced = 0;

  for (const grid of sortedGrids) {
    if (state.pendingOrders.has(grid.id)) continue;

    const potentialInvestment = state.investedCapital + config.capital.perGridAmount;
    if (potentialInvestment > config.capital.maxCapital) {
      console.log("[SMART_GRID_BOOTSTRAP] Investment cap reached");
      break;
    }

    // ✅ PLACE BUY ORDER: Grid is BELOW current price
    if (grid.buyPrice < currentPrice && grid.status === "EMPTY") {
      // ✅ Validate price is within acceptable range (Binance PERCENT_PRICE_BY_SIDE filter)
      const priceDeviation = Math.abs((grid.buyPrice - currentPrice) / currentPrice);
      if (priceDeviation > 0.1) { // 10% max deviation
        console.warn("[SMART_GRID_BOOTSTRAP] Grid price too far from market, skipping", {
          gridId: grid.id,
          gridPrice: grid.buyPrice,
          marketPrice: currentPrice,
          deviation: `${(priceDeviation * 100).toFixed(2)}%`,
        });
        continue;
      }

      state.pendingOrders.add(grid.id);

      const stopLossPrice = config.stopLossPercentage
        ? grid.buyPrice * (1 - config.stopLossPercentage / 100)
        : undefined;

      const qty = await formatQuantity({
        exchange: strategy.exchange,
        tradeType: strategy.segment,
        symbol: strategy.symbol,
        rawQty: strategy.assetType === "STOCK" 
          ? config.capital.perGridAmount 
          : config.capital.perGridAmount / grid.buyPrice,
      });

      console.log("[SMART_GRID_BOOTSTRAP_BUY]", {
        gridId: grid.id,
        buyPrice: grid.buyPrice,
        quantity: qty,
        targetSellPrice: grid.sellPrice,
        priceDeviation: `${(priceDeviation * 100).toFixed(2)}%`,
      });

      await tradeDispatcher.dispatch({
        userId: strategy.userId,
        exchange: strategy.exchange,
        segment: strategy.assetType as "CRYPTO" | "STOCK",
        tradeType: strategy.segment as "SPOT" | "FUTURES",
        symbol: strategy.symbol,
        side: "BUY",
        quantity: qty,
        price: grid.buyPrice,
        takeProfit: grid.sellPrice,
        stopLoss: stopLossPrice,
        orderType: "LIMIT",
        strategyId: strategy.id,
        onComplete: () => {
          const targetGrid = state.grids.find((g) => g.id === grid.id);
          if (targetGrid) {
            targetGrid.status = "BOUGHT";
            targetGrid.quantity = qty;
            state.investedCapital += config.capital.perGridAmount;
          }
          state.pendingOrders.delete(grid.id);
          state.lastExecutionAt = timestamp;

          console.log("[SMART_GRID_BOOTSTRAP_BUY_COMPLETE]", {
            gridId: grid.id,
            investedCapital: state.investedCapital,
          });
        },
      });

      buyOrdersPlaced++;
    }
  }

  console.log("[SMART_GRID_BOOTSTRAP_COMPLETE]", {
    strategyId: strategy.id,
    buyOrdersPlaced,
    totalPendingOrders: state.pendingOrders.size,
    investedCapital: state.investedCapital,
  });
}

// ✅ UPDATED: Smart Grid Handler with Bootstrap Check
async function handleSmartGrid(
  strategy: Strategy,
  state: SmartGridState,
  price: number,
  timestamp: number
) {
  const config = strategy.config as any;

  // ✅ PHASE 0: LIFECYCLE STATE MACHINE

  // State: INIT → Trigger bootstrap
  if (state.lifecycle === "INIT") {
    console.log("[SMART_GRID] Lifecycle: INIT → Triggering bootstrap", {
      strategyId: strategy.id,
      currentPrice: price,
    });
    
    await bootstrapSmartGrid(strategy, state, price, timestamp);
    return; // Exit after bootstrap attempt
  }

  // State: WAITING_FOR_PRICE → Check if price entered range
  if (state.lifecycle === "WAITING_FOR_PRICE") {
    if (price >= config.lowerLimit && price <= config.upperLimit) {
      console.log("[SMART_GRID] Price entered range, transitioning to INIT", {
        strategyId: strategy.id,
        price,
        range: `${config.lowerLimit} - ${config.upperLimit}`,
      });
      state.lifecycle = "INIT";
      return; // Let next tick trigger bootstrap
    } else {
      // Still waiting
      return;
    }
  }

  // State: BOOTSTRAPPED → Transition to RUNNING
  if (state.lifecycle === "BOOTSTRAPPED") {
    state.lifecycle = "RUNNING";
    console.log("[SMART_GRID] Lifecycle: BOOTSTRAPPED → RUNNING", {
      strategyId: strategy.id,
    });
  }

  // ✅ PHASE 1: RANGE CHECK (for RUNNING state)
  if (price < config.lowerLimit || price <= config.upperLimit) {
    console.log("[SMART_GRID] Price outside range, entering WAITING_FOR_PRICE", {
      strategyId: strategy.id,
      price,
      range: `${config.lowerLimit} - ${config.upperLimit}`,
    });
    state.lifecycle = "WAITING_FOR_PRICE";
    return;
  }

  // ✅ PHASE 2: DYNAMIC RECALCULATION (optional)
  if (state.mode === "DYNAMIC") {
    const recalcInterval = (config.recalculationInterval || 15) * 60 * 1000;
    const shouldRecalculate = !state.lastRecalculationAt || 
      (timestamp - state.lastRecalculationAt) > recalcInterval;

    if (shouldRecalculate) {
      console.log("[SMART_GRID_RECALC] Triggering dynamic recalculation", {
        strategyId: strategy.id,
        lastRecalc: state.lastRecalculationAt,
      });
      // TODO: Implement recalculation logic
      state.lastRecalculationAt = timestamp;
    }
  }

  // ✅ PHASE 3: REACTIVE TRADING
  console.log("[SMART_GRID_TICK]", {
    strategyId: strategy.id,
    price,
    lifecycle: state.lifecycle,
    activeGrids: state.grids.filter(g => g.status === "EMPTY").length,
    filledGrids: state.grids.filter(g => g.status === "BOUGHT").length,
    pendingOrders: state.pendingOrders.size,
    investedCapital: state.investedCapital,
    mode: state.mode,
  });

  const decision = evaluateSmartGrid(strategy, state, price);

  if (decision.action === "HOLD") {
    return;
  }

  // Handle BUY (reactive)
  if (decision.action === "BUY" && decision.gridId) {
    const potentialInvestment = state.investedCapital + config.capital.perGridAmount;
    if (potentialInvestment > config.capital.maxCapital) {
      console.log("[SMART_GRID] Investment cap reached");
      return;
    }

    state.pendingOrders.add(decision.gridId);

    const qty = await formatQuantity({
      exchange: strategy.exchange,
      tradeType: strategy.segment,
      symbol: strategy.symbol,
      rawQty: strategy.assetType === "STOCK" 
        ? config.capital.perGridAmount 
        : config.capital.perGridAmount / price,
    });

    console.log("[SMART_GRID_BUY]", {
      strategyId: strategy.id,
      gridId: decision.gridId,
      buyPrice: decision.price,
      quantity: qty,
      targetSellPrice: decision.price! * (1 + config.profitPercentage / 100),
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
      takeProfit: decision.price! * (1 + config.profitPercentage / 100),
      stopLoss: undefined,
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

        console.log("[SMART_GRID_BUY_COMPLETE]", {
          gridId: decision.gridId,
          investedCapital: state.investedCapital,
        });
      },
    });
  }

  // Handle SELL (reactive)
  if (decision.action === "SELL" && decision.gridId) {
    state.pendingOrders.add(decision.gridId);

    console.log("[SMART_GRID_SELL]", {
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

        console.log("[SMART_GRID_SELL_COMPLETE]", {
          gridId: decision.gridId,
          investedCapital: state.investedCapital,
        });
      },
    });
  }
}