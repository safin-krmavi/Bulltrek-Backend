import { Strategy } from "@prisma/client";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { tradeDispatcher } from "../../services/strategies/tradeDispatcher";
import { exitMonitor } from "../monitors/exitMonitor";
import { formatQuantity } from "../../utils/crypto/exchange/quantityFormatter";
import { generateSmartGridLevels } from "../../utils/strategies/gridCalculations";
import {
  evaluateHumanGrid,
  evaluateSmartGrid,
} from "../../services/strategies/evaluators/humanGridEvaluator";
import {
  HumanGridState,
  SmartGridState,
  GridLevel,
} from "../../types/strategies/humanGrid.types";
import { changeStrategyStatus } from "../../services/strategyService";
import prisma from "../../config/db.config";

/* -------------------------------------------------------------------------- */
/*                            STRATEGY STATE MAP                              */
/* -------------------------------------------------------------------------- */

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

type StrategyStateMap = {
  GROWTH_DCA: GrowthDCAState;
  HUMAN_GRID: HumanGridState;
  SMART_GRID: SmartGridState;
};

/* -------------------------------------------------------------------------- */
/*                         IN-MEMORY REGISTRY                                 */
/* -------------------------------------------------------------------------- */

const registeredStrategies = new Map<
  string,
  { strategy: Strategy; state: StrategyStateMap[keyof StrategyStateMap] }
>();

/* -------------------------------------------------------------------------- */
/*                         HELPER FUNCTIONS                                   */
/* -------------------------------------------------------------------------- */

/**
 * ✅ FIX #1: Calculate quantity with leverage support
 */
async function calculateQuantityWithLeverage(params: {
  exchange: string;
  tradeType: string;
  symbol: string;
  rawQty: number;
  leverage?: number;
}): Promise<number> {
  const baseQty = await formatQuantity({
    exchange: params.exchange,
    tradeType: params.tradeType,
    symbol: params.symbol,
    rawQty: params.rawQty,
  });

  // Apply leverage multiplier for futures
  if (params.leverage && params.leverage > 1) {
    return baseQty * params.leverage;
  }

  return baseQty;
}

/**
 * ✅ FIX #2: Get order side based on direction (Long/Short)
 */
function getOrderSide(config: any, action: "BUY" | "SELL"): "BUY" | "SELL" {
  // For LONG strategies (default)
  if (!config.direction || config.direction === "LONG") {
    return action; // BUY to open, SELL to close
  }

  // For SHORT strategies: Reverse the logic
  if (config.direction === "SHORT") {
    return action === "BUY" ? "SELL" : "BUY"; // SELL to open, BUY to close
  }

  return action;
}

/* -------------------------------------------------------------------------- */
/*                         SIGNAL ENGINE MAIN OBJECT                          */
/* -------------------------------------------------------------------------- */

export const signalEngine = {
  /**
   * Register a signal-based strategy
   */
  async register(strategy: Strategy) {
    console.log("[SIGNAL_ENGINE] Registering strategy", {
      id: strategy.id,
      type: strategy.type,
      symbol: strategy.symbol,
    });

    let state: StrategyStateMap[keyof StrategyStateMap];

    if (strategy.type === "GROWTH_DCA") {
      state = {
        investedCapital: 0,
        entries: [],
        lastExecutionAt: null,
        nextRunAt: null,
      } as GrowthDCAState;
    } else if (strategy.type === "HUMAN_GRID") {
      const gridConfig = strategy.config as any;
      state = {
        grids: gridConfig.grids || [],
        investedCapital: 0,
        lastExecutionAt: null,
        status: "ACTIVE",
        lifecycle: "INIT",
        pendingOrders: new Set<string>(),
        executedCycles: 0, // ✅ FIX #4: Initialize cycle counter
      } as HumanGridState;
    } else if (strategy.type === "SMART_GRID") {
      const smartGridConfig = strategy.config as any;
      state = {
        grids: smartGridConfig.grids || [],
        investedCapital: 0,
        lifecycle: "INIT",
        mode: smartGridConfig.mode || "STATIC",
        pendingOrders: new Set<string>(),
        indicators: {
          bollingerUpper: smartGridConfig.indicators?.bollingerUpper || 0,
          bollingerLower: smartGridConfig.indicators?.bollingerLower || 0,
          atr: smartGridConfig.indicators?.atr || 0,
        },
        lastRecalculationAt: null,
      } as SmartGridState;
    } else {
      throw new Error(`Unsupported strategy type: ${strategy.type}`);
    }

    registeredStrategies.set(strategy.id, { strategy, state });

    // Subscribe to market data
    if (strategy.assetType === "CRYPTO") {
      await MarketDataManager.subscribe(
        strategy.exchange as any,
        strategy.segment as any,
        strategy.symbol,
        strategy.id
      );
    }

    console.log("[SIGNAL_ENGINE] Strategy registered successfully", {
      id: strategy.id,
      subscribedToMarketData: strategy.assetType === "CRYPTO",
    });
  },

  /**
   * Unregister a strategy
   */
  unregister(strategyId: string) {
    const entry = registeredStrategies.get(strategyId);
    if (!entry) return;

    const { strategy } = entry;

    // Unsubscribe from market data
    if (strategy.assetType === "CRYPTO") {
      MarketDataManager.unsubscribe(
        strategy.exchange,
        strategy.segment as any,
        strategy.symbol,
        strategyId
      );
    }

    registeredStrategies.delete(strategyId);

    console.log("[SIGNAL_ENGINE] Strategy unregistered", { strategyId });
  },

  /**
   * Handle incoming market tick
   */
  async onMarketTick(strategyId: string, price: number, timestamp: number) {
    const entry = registeredStrategies.get(strategyId);
    if (!entry) return;

    const { strategy, state } = entry;

    try {
      if (strategy.type === "HUMAN_GRID") {
        await handleHumanGrid(strategy, state as HumanGridState, price, timestamp);
      } else if (strategy.type === "SMART_GRID") {
        await handleSmartGrid(strategy, state as SmartGridState, price, timestamp);
      } else if (strategy.type === "GROWTH_DCA") {
        // Growth DCA is time-based, not signal-based
        // But can still react to price changes if needed
      }
    } catch (error) {
      console.error("[SIGNAL_ENGINE_ERROR]", {
        strategyId,
        error: (error as any).message,
        stack: (error as any).stack,
      });
    }
  },

  /**
   * Get all registered strategies
   */
  getRegisteredStrategies() {
    return Array.from(registeredStrategies.keys());
  },

  /**
   * Get strategy state
   */
  getStrategyState(strategyId: string) {
    return registeredStrategies.get(strategyId)?.state;
  },
};

/* -------------------------------------------------------------------------- */
/*                         HUMAN GRID HANDLER                                 */
/* -------------------------------------------------------------------------- */

async function handleHumanGrid(
  strategy: Strategy,
  state: HumanGridState,
  price: number,
  timestamp: number
) {
  const config = strategy.config as any;

  // ✅ PHASE 0: LIFECYCLE STATE MACHINE

  // State: INIT → Bootstrap initial orders
  if (state.lifecycle === "INIT") {
    const currentPrice = price;

    // Check if current price is within grid range
    if (currentPrice < config.lowerLimit || currentPrice > config.upperLimit) {
      console.log("[HUMAN_GRID_INIT] Price outside range, waiting", {
        strategyId: strategy.id,
        price: currentPrice,
        range: `${config.lowerLimit} - ${config.upperLimit}`,
      });

      state.lifecycle = "WAITING_FOR_PRICE";
      return;
    }

    // Price is within range, bootstrap
    await bootstrapHumanGrid(strategy, state, currentPrice, timestamp);
    return;
  }

  // State: WAITING_FOR_PRICE → Check if price entered range
  if (state.lifecycle === "WAITING_FOR_PRICE") {
    if (price >= config.lowerLimit && price <= config.upperLimit) {
      console.log("[HUMAN_GRID] Price entered range, starting bootstrap", {
        strategyId: strategy.id,
        price,
      });

      state.lifecycle = "RUNNING";
      await bootstrapHumanGrid(strategy, state, price, timestamp);
    }
    return;
  }

  // State: STOPPED → Do nothing
  if (state.lifecycle === "STOPPED") {
    return;
  }

  // ✅ PHASE 1: REACTIVE TRADING (RUNNING state)

  // Check if price is still within range
  if (price < config.lowerLimit || price > config.upperLimit) {
    console.log("[HUMAN_GRID] Price outside range", {
      strategyId: strategy.id,
      price,
      range: `${config.lowerLimit} - ${config.upperLimit}`,
    });
    return;
  }

  console.log("[HUMAN_GRID_TICK]", {
    strategyId: strategy.id,
    price,
    activeGrids: state.grids.filter((g) => g.status === "EMPTY").length,
    filledGrids: state.grids.filter((g) => g.status === "BOUGHT").length,
    pendingOrders: state.pendingOrders.size,
    investedCapital: state.investedCapital,
    executedCycles: state.executedCycles,
  });

  const decision = evaluateHumanGrid(strategy, state, price);

  if (decision.action === "HOLD") {
    return;
  }

  // Handle BUY
  if (decision.action === "BUY" && decision.gridId) {
    const potentialInvestment = state.investedCapital + config.capital.perGridAmount;
    if (potentialInvestment > config.capital.maxCapital) {
      console.log("[HUMAN_GRID] Investment cap reached", {
        strategyId: strategy.id,
        investedCapital: state.investedCapital,
        maxCapital: config.capital.maxCapital,
      });
      return;
    }

    state.pendingOrders.add(decision.gridId);

    const formattedBuyPrice = parseFloat(decision.price!.toFixed(2));
    const formattedTakeProfit = parseFloat((decision.price! + config.bookProfitBy).toFixed(2));

    const stopLossPrice = config.stopLossPercentage
      ? parseFloat((price * (1 - config.stopLossPercentage / 100)).toFixed(2))
      : undefined;

    // ✅ FIX #1: Calculate quantity with leverage
    const qty = await calculateQuantityWithLeverage({
      exchange: strategy.exchange,
      tradeType: strategy.segment,
      symbol: strategy.symbol,
      rawQty:
        strategy.assetType === "STOCK"
          ? config.capital.perGridAmount
          : config.capital.perGridAmount / price,
      leverage: strategy.segment === "FUTURES" ? config.leverage : undefined,
    });

    console.log("[HUMAN_GRID_BUY]", {
      strategyId: strategy.id,
      gridId: decision.gridId,
      buyPrice: formattedBuyPrice,
      quantity: qty,
      leverage: config.leverage,
      direction: config.direction || "LONG",
      targetSellPrice: formattedTakeProfit,
      stopLoss: stopLossPrice,
    });

    await tradeDispatcher.dispatch({
      userId: strategy.userId,
      exchange: strategy.exchange,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: strategy.segment as "SPOT" | "FUTURES",
      symbol: strategy.symbol,
      side: getOrderSide(config, "BUY"), // ✅ FIX #2: Use dynamic side
      quantity: qty,
      price: formattedBuyPrice,
      takeProfit: formattedTakeProfit,
      stopLoss: stopLossPrice,
      orderType: "LIMIT",
      strategyId: strategy.id,
      onComplete: async () => {
        const grid = state.grids.find((g) => g.id === decision.gridId);
        if (grid) {
          grid.status = "BOUGHT";
          grid.quantity = qty;
          state.investedCapital += config.capital.perGridAmount;
        }
        state.pendingOrders.delete(decision.gridId!);
        state.lastExecutionAt = timestamp;

        // ✅ FIX #5: Track position in exit monitor
        await exitMonitor.trackPosition(strategy.id, {
          tradeId: `${strategy.id}-${decision.gridId}`,
          userId: strategy.userId,
          symbol: strategy.symbol,
          side: "BUY",
          entryPrice: formattedBuyPrice,
          quantity: qty,
          segment: strategy.assetType as "CRYPTO" | "STOCK",
          exchange: strategy.exchange,
          tradeType: strategy.segment as "SPOT" | "FUTURES",
          takeProfit: formattedTakeProfit,
          stopLoss: stopLossPrice,
        });

        console.log("[HUMAN_GRID_BUY_COMPLETE]", {
          strategyId: strategy.id,
          gridId: decision.gridId,
          direction: config.direction || "LONG",
          actualSide: getOrderSide(config, "BUY"),
          investedCapital: state.investedCapital,
        });
      },
    });
  }

  // Handle SELL
  if (decision.action === "SELL" && decision.gridId) {
    state.pendingOrders.add(decision.gridId);

    const formattedSellPrice = parseFloat(decision.price!.toFixed(2));

    console.log("[HUMAN_GRID_SELL]", {
      strategyId: strategy.id,
      gridId: decision.gridId,
      sellPrice: formattedSellPrice,
      quantity: decision.quantity,
    });

    await tradeDispatcher.dispatch({
      userId: strategy.userId,
      exchange: strategy.exchange,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: strategy.segment as "SPOT" | "FUTURES",
      symbol: strategy.symbol,
      side: getOrderSide(config, "SELL"), // ✅ FIX #2: Use dynamic side
      quantity: decision.quantity!,
      price: formattedSellPrice,
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

        // ✅ FIX #4: Check if cycle completed
        const allEmpty = state.grids.every((g) => g.status === "EMPTY");
        if (allEmpty && state.executedCycles < (config.maxCycles || Infinity)) {
          state.executedCycles++;

          console.log("[HUMAN_GRID_CYCLE_COMPLETE]", {
            strategyId: strategy.id,
            completedCycles: state.executedCycles,
            maxCycles: config.maxCycles,
          });

          // ✅ FIX #4: Check if max cycles reached
          if (config.maxCycles && state.executedCycles >= config.maxCycles) {
            console.log("[HUMAN_GRID] Max cycles reached, stopping strategy", {
              strategyId: strategy.id,
              cycles: state.executedCycles,
            });

            // Stop strategy
            changeStrategyStatus(strategy.id, strategy.userId, "STOPPED");
            state.lifecycle = "STOPPED";
            state.status = "STOPPED";
            return;
          }
        }

        console.log("[HUMAN_GRID_SELL_COMPLETE]", {
          strategyId: strategy.id,
          gridId: decision.gridId,
          direction: config.direction || "LONG",
          actualSide: getOrderSide(config, "SELL"),
          investedCapital: state.investedCapital,
          executedCycles: state.executedCycles,
        });
      },
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                         HUMAN GRID BOOTSTRAP                               */
/* -------------------------------------------------------------------------- */

async function bootstrapHumanGrid(
  strategy: Strategy,
  state: HumanGridState,
  currentPrice: number,
  timestamp: number
) {
  const config = strategy.config as any;

  console.log("[HUMAN_GRID_BOOTSTRAP] Starting initial order placement", {
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
      console.log("[HUMAN_GRID_BOOTSTRAP] Investment cap reached");
      break;
    }

    // ✅ PLACE BUY ORDER: Grid is BELOW current price
    if (grid.buyPrice < currentPrice && grid.status === "EMPTY") {
      // Validate price deviation
      const priceDeviation = Math.abs((grid.buyPrice - currentPrice) / currentPrice);
      if (priceDeviation > 0.1) {
        console.warn("[HUMAN_GRID_BOOTSTRAP] Grid price too far from market, skipping", {
          gridId: grid.id,
          gridPrice: grid.buyPrice,
          marketPrice: currentPrice,
          deviation: `${(priceDeviation * 100).toFixed(2)}%`,
        });
        continue;
      }

      state.pendingOrders.add(grid.id);

      const formattedBuyPrice = parseFloat(grid.buyPrice.toFixed(2));
      const formattedSellPrice = parseFloat((grid.buyPrice + config.bookProfitBy).toFixed(2));

      const stopLossPrice = config.stopLossPercentage
        ? parseFloat((grid.buyPrice * (1 - config.stopLossPercentage / 100)).toFixed(2))
        : undefined;

      // ✅ FIX #1: Calculate quantity with leverage
      const qty = await calculateQuantityWithLeverage({
        exchange: strategy.exchange,
        tradeType: strategy.segment,
        symbol: strategy.symbol,
        rawQty:
          strategy.assetType === "STOCK"
            ? config.capital.perGridAmount
            : config.capital.perGridAmount / grid.buyPrice,
        leverage: strategy.segment === "FUTURES" ? config.leverage : undefined,
      });

      console.log("[HUMAN_GRID_BOOTSTRAP_BUY]", {
        gridId: grid.id,
        buyPrice: formattedBuyPrice,
        quantity: qty,
        leverage: config.leverage,
        direction: config.direction || "LONG",
        targetSellPrice: formattedSellPrice,
        priceDeviation: `${(priceDeviation * 100).toFixed(2)}%`,
      });

      await tradeDispatcher.dispatch({
        userId: strategy.userId,
        exchange: strategy.exchange,
        segment: strategy.assetType as "CRYPTO" | "STOCK",
        tradeType: strategy.segment as "SPOT" | "FUTURES",
        symbol: strategy.symbol,
        side: getOrderSide(config, "BUY"), // ✅ FIX #2: Use dynamic side
        quantity: qty,
        price: formattedBuyPrice,
        takeProfit: formattedSellPrice,
        stopLoss: stopLossPrice,
        orderType: "LIMIT",
        strategyId: strategy.id,
        onComplete: async () => {
          const targetGrid = state.grids.find((g) => g.id === grid.id);
          if (targetGrid) {
            targetGrid.status = "BOUGHT";
            targetGrid.quantity = qty;
            state.investedCapital += config.capital.perGridAmount;
          }
          state.pendingOrders.delete(grid.id);
          state.lastExecutionAt = timestamp;

          // ✅ FIX #5: Track position in exit monitor
          await exitMonitor.trackPosition(strategy.id, {
            tradeId: `${strategy.id}-${grid.id}`,
            userId: strategy.userId,
            symbol: strategy.symbol,
            side: "BUY",
            entryPrice: formattedBuyPrice,
            quantity: qty,
            segment: strategy.assetType as "CRYPTO" | "STOCK",
            exchange: strategy.exchange,
            tradeType: strategy.segment as "SPOT" | "FUTURES",
            takeProfit: formattedSellPrice,
            stopLoss: stopLossPrice,
          });

          console.log("[HUMAN_GRID_BOOTSTRAP_BUY_COMPLETE]", {
            gridId: grid.id,
            investedCapital: state.investedCapital,
            positionTracked: true,
          });
        },
      });

      buyOrdersPlaced++;
    }
  }

  // After bootstrap, transition to RUNNING
  state.lifecycle = "RUNNING";

  console.log("[HUMAN_GRID_BOOTSTRAP_COMPLETE]", {
    strategyId: strategy.id,
    buyOrdersPlaced,
    totalPendingOrders: state.pendingOrders.size,
    investedCapital: state.investedCapital,
  });
}

/* -------------------------------------------------------------------------- */
/*                         SMART GRID HANDLER                                 */
/* -------------------------------------------------------------------------- */

async function handleSmartGrid(
  strategy: Strategy,
  state: SmartGridState,
  price: number,
  timestamp: number
) {
  const config = strategy.config as any;

  // ✅ PHASE 0: LIFECYCLE STATE MACHINE

  // State: INIT → Bootstrap initial orders
  if (state.lifecycle === "INIT") {
    const currentPrice = price;

    // Validate price is within grid range
    if (currentPrice < config.lowerLimit || currentPrice > config.upperLimit) {
      console.log("[SMART_GRID_INIT] Price outside range, waiting", {
        strategyId: strategy.id,
        price: currentPrice,
        range: `${config.lowerLimit} - ${config.upperLimit}`,
        deviation:
          currentPrice < config.lowerLimit
            ? `${(((config.lowerLimit - currentPrice) / currentPrice) * 100).toFixed(2)}% below`
            : `${(((currentPrice - config.upperLimit) / currentPrice) * 100).toFixed(2)}% above`,
      });

      state.lifecycle = "WAITING_FOR_PRICE";
      return;
    }

    // Price is within range, bootstrap
    await bootstrapSmartGrid(strategy, state, currentPrice, timestamp);
    return;
  }

  // State: WAITING_FOR_PRICE → Check if price entered range
  if (state.lifecycle === "WAITING_FOR_PRICE") {
    if (price >= config.lowerLimit && price <= config.upperLimit) {
      console.log("[SMART_GRID] Price entered range, starting bootstrap", {
        strategyId: strategy.id,
        price,
      });

      state.lifecycle = "RUNNING";
      await bootstrapSmartGrid(strategy, state, price, timestamp);
    }
    return;
  }

  // State: STOPPED → Do nothing
  if (state.lifecycle === "STOPPED") {
    return;
  }

  // ✅ PHASE 1: DYNAMIC MODE RECALCULATION (if enabled)
  if (state.mode === "DYNAMIC") {
    const recalcInterval = (config.recalculationInterval || 15) * 60 * 1000;
    const shouldRecalculate =
      !state.lastRecalculationAt || timestamp - state.lastRecalculationAt > recalcInterval;

    if (shouldRecalculate) {
      console.log("[SMART_GRID_DYNAMIC] Recalculating grid parameters", {
        strategyId: strategy.id,
        lastRecalc: state.lastRecalculationAt
          ? new Date(state.lastRecalculationAt).toISOString()
          : "never",
      });

      try {
const { generateSmartGridParams } = await import(
  "../../services/strategies/indicatorCalculator.js"
);
        const newParams = await generateSmartGridParams({
          exchange: strategy.exchange,
          symbol: strategy.symbol,
          dataSetDays: config.dataSetDays,
        });

        const rangeDiff = Math.abs(newParams.lowerLimit - config.lowerLimit) / config.lowerLimit;

        if (rangeDiff > 0.1) {
          console.log("[SMART_GRID_DYNAMIC] Significant range change, initiating rebalance", {
            oldRange: `${config.lowerLimit} - ${config.upperLimit}`,
            newRange: `${newParams.lowerLimit} - ${newParams.upperLimit}`,
            diff: `${(rangeDiff * 100).toFixed(2)}%`,
          });

          // ✅ FIX #3: Use Promise.allSettled to wait for all orders
          const sellPromises = state.grids
            .filter((g) => g.status === "BOUGHT")
            .map((grid) => {
              return new Promise<void>((resolve) => {
                state.pendingOrders.add(grid.id);

                tradeDispatcher.dispatch({
                  userId: strategy.userId,
                  exchange: strategy.exchange,
                  segment: strategy.assetType as "CRYPTO" | "STOCK",
                  tradeType: strategy.segment as "SPOT" | "FUTURES",
                  symbol: strategy.symbol,
                  side: getOrderSide(config, "SELL"),
                  quantity: grid.quantity,
                  price: parseFloat(price.toFixed(2)),
                  orderType: "MARKET",
                  strategyId: strategy.id,
                  onComplete: () => {
                    grid.status = "EMPTY";
                    grid.quantity = 0;
                    state.pendingOrders.delete(grid.id);
                    resolve();
                  },
                });
              });
            });

          await Promise.allSettled(sellPromises);

          // ✅ FIX #3: Atomically update config and state
          const updatedConfig = {
            ...config,
            lowerLimit: newParams.lowerLimit,
            upperLimit: newParams.upperLimit,
            indicators: newParams.indicators,
          };

          // Update database
          await prisma.strategy.update({
            where: { id: strategy.id },
            data: {
              config: updatedConfig,
            },
          });

          // ✅ FIX #3: Update in-memory state after DB success
          Object.assign(config, updatedConfig);
          state.grids = generateSmartGridLevels(updatedConfig);
          state.investedCapital = 0;
          state.pendingOrders.clear();
          state.lastRecalculationAt = timestamp;

          // ✅ FIX #3: Update strategy reference
          registeredStrategies.set(strategy.id, {
            strategy: { ...strategy, config: updatedConfig },
            state,
          });

          console.log("[SMART_GRID_DYNAMIC_COMPLETE]", {
            strategyId: strategy.id,
            newGridCount: state.grids.length,
          });
        } else {
          // No rebalance needed, just update timestamp
          state.lastRecalculationAt = timestamp;
        }
      } catch (error) {
        console.error("[SMART_GRID_DYNAMIC_ERROR]", {
          strategyId: strategy.id,
          error: (error as any).message,
        });
        // Don't update lastRecalculationAt on error - retry next interval
      }
    }
  }

  // ✅ PHASE 2: REACTIVE TRADING (RUNNING state)

  // Check if price is still within range
  if (price < config.lowerLimit || price > config.upperLimit) {
    console.log("[SMART_GRID] Price outside range", {
      strategyId: strategy.id,
      price,
      range: `${config.lowerLimit} - ${config.upperLimit}`,
    });
    return;
  }

  console.log("[SMART_GRID_TICK]", {
    strategyId: strategy.id,
    price,
    activeGrids: state.grids.filter((g) => g.status === "EMPTY").length,
    filledGrids: state.grids.filter((g) => g.status === "BOUGHT").length,
    pendingOrders: state.pendingOrders.size,
    investedCapital: state.investedCapital,
    mode: state.mode,
  });

  const decision = evaluateSmartGrid(strategy, state, price);

  if (decision.action === "HOLD") {
    return;
  }

  // Handle BUY
  if (decision.action === "BUY" && decision.gridId) {
    const potentialInvestment = state.investedCapital + config.capital.perGridAmount;
    if (potentialInvestment > config.capital.maxCapital) {
      console.log("[SMART_GRID] Investment cap reached", {
        strategyId: strategy.id,
        investedCapital: state.investedCapital,
        maxCapital: config.capital.maxCapital,
      });
      return;
    }

    state.pendingOrders.add(decision.gridId);

    const formattedBuyPrice = parseFloat(decision.price!.toFixed(2));
    const formattedTakeProfit = parseFloat(
      (decision.price! * (1 + config.profitPercentage / 100)).toFixed(2)
    );

    const stopLossPrice = config.stopLossPercentage
      ? parseFloat((decision.price! * (1 - config.stopLossPercentage / 100)).toFixed(2))
      : undefined;

    // ✅ FIX #1: Calculate quantity with leverage
    const qty = await calculateQuantityWithLeverage({
      exchange: strategy.exchange,
      tradeType: strategy.segment,
      symbol: strategy.symbol,
      rawQty:
        strategy.assetType === "STOCK"
          ? config.capital.perGridAmount
          : config.capital.perGridAmount / price,
      leverage: strategy.segment === "FUTURES" ? config.leverage : undefined,
    });

    console.log("[SMART_GRID_BUY]", {
      strategyId: strategy.id,
      gridId: decision.gridId,
      buyPrice: formattedBuyPrice,
      quantity: qty,
      leverage: config.leverage,
      direction: config.direction || "LONG",
      targetSellPrice: formattedTakeProfit,
      stopLoss: stopLossPrice,
    });

    await tradeDispatcher.dispatch({
      userId: strategy.userId,
      exchange: strategy.exchange,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: strategy.segment as "SPOT" | "FUTURES",
      symbol: strategy.symbol,
      side: getOrderSide(config, "BUY"), // ✅ FIX #2: Use dynamic side
      quantity: qty,
      price: formattedBuyPrice,
      takeProfit: formattedTakeProfit,
      stopLoss: stopLossPrice,
      orderType: "LIMIT",
      strategyId: strategy.id,
      onComplete: async () => {
        const grid = state.grids.find((g) => g.id === decision.gridId);
        if (grid) {
          grid.status = "BOUGHT";
          grid.quantity = qty;
          state.investedCapital += config.capital.perGridAmount;
        }
        state.pendingOrders.delete(decision.gridId!);
        state.lastExecutionAt = timestamp;

        // ✅ FIX #5: Track position in exit monitor
        await exitMonitor.trackPosition(strategy.id, {
          tradeId: `${strategy.id}-${decision.gridId}`,
          userId: strategy.userId,
          symbol: strategy.symbol,
          side: "BUY",
          entryPrice: formattedBuyPrice,
          quantity: qty,
          segment: strategy.assetType as "CRYPTO" | "STOCK",
          exchange: strategy.exchange,
          tradeType: strategy.segment as "SPOT" | "FUTURES",
          takeProfit: formattedTakeProfit,
          stopLoss: stopLossPrice,
        });

        console.log("[SMART_GRID_BUY_COMPLETE]", {
          strategyId: strategy.id,
          gridId: decision.gridId,
          direction: config.direction || "LONG",
          actualSide: getOrderSide(config, "BUY"),
          investedCapital: state.investedCapital,
        });
      },
    });
  }

  // Handle SELL
  if (decision.action === "SELL" && decision.gridId) {
    state.pendingOrders.add(decision.gridId);

    const formattedSellPrice = parseFloat(decision.price!.toFixed(2));

    console.log("[SMART_GRID_SELL]", {
      strategyId: strategy.id,
      gridId: decision.gridId,
      sellPrice: formattedSellPrice,
      quantity: decision.quantity,
    });

    await tradeDispatcher.dispatch({
      userId: strategy.userId,
      exchange: strategy.exchange,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: strategy.segment as "SPOT" | "FUTURES",
      symbol: strategy.symbol,
      side: getOrderSide(config, "SELL"), // ✅ FIX #2: Use dynamic side
      quantity: decision.quantity!,
      price: formattedSellPrice,
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
          strategyId: strategy.id,
          gridId: decision.gridId,
          direction: config.direction || "LONG",
          actualSide: getOrderSide(config, "SELL"),
          investedCapital: state.investedCapital,
        });
      },
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                         SMART GRID BOOTSTRAP                               */
/* -------------------------------------------------------------------------- */

async function bootstrapSmartGrid(
  strategy: Strategy,
  state: SmartGridState,
  currentPrice: number,
  timestamp: number
) {
  const config = strategy.config as any;

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
      // Validate price is within acceptable range
      const priceDeviation = Math.abs((grid.buyPrice - currentPrice) / currentPrice);
      if (priceDeviation > 0.1) {
        console.warn("[SMART_GRID_BOOTSTRAP] Grid price too far from market, skipping", {
          gridId: grid.id,
          gridPrice: grid.buyPrice,
          marketPrice: currentPrice,
          deviation: `${(priceDeviation * 100).toFixed(2)}%`,
        });
        continue;
      }

      state.pendingOrders.add(grid.id);

      const formattedBuyPrice = parseFloat(grid.buyPrice.toFixed(2));
      const formattedSellPrice = parseFloat(grid.sellPrice.toFixed(2));

      const stopLossPrice = config.stopLossPercentage
        ? parseFloat((grid.buyPrice * (1 - config.stopLossPercentage / 100)).toFixed(2))
        : undefined;

      // ✅ FIX #1: Calculate quantity with leverage
      const qty = await calculateQuantityWithLeverage({
        exchange: strategy.exchange,
        tradeType: strategy.segment,
        symbol: strategy.symbol,
        rawQty:
          strategy.assetType === "STOCK"
            ? config.capital.perGridAmount
            : config.capital.perGridAmount / grid.buyPrice,
        leverage: strategy.segment === "FUTURES" ? config.leverage : undefined,
      });

      console.log("[SMART_GRID_BOOTSTRAP_BUY]", {
        gridId: grid.id,
        buyPrice: formattedBuyPrice,
        quantity: qty,
        leverage: config.leverage,
        direction: config.direction || "LONG",
        targetSellPrice: formattedSellPrice,
        priceDeviation: `${(priceDeviation * 100).toFixed(2)}%`,
      });

      await tradeDispatcher.dispatch({
        userId: strategy.userId,
        exchange: strategy.exchange,
        segment: strategy.assetType as "CRYPTO" | "STOCK",
        tradeType: strategy.segment as "SPOT" | "FUTURES",
        symbol: strategy.symbol,
        side: getOrderSide(config, "BUY"), // ✅ FIX #2: Use dynamic side
        quantity: qty,
        price: formattedBuyPrice,
        takeProfit: formattedSellPrice,
        stopLoss: stopLossPrice,
        orderType: "LIMIT",
        strategyId: strategy.id,
        onComplete: async () => {
          const targetGrid = state.grids.find((g) => g.id === grid.id);
          if (targetGrid) {
            targetGrid.status = "BOUGHT";
            targetGrid.quantity = qty;
            state.investedCapital += config.capital.perGridAmount;
          }
          state.pendingOrders.delete(grid.id);
          state.lastExecutionAt = timestamp;

          // ✅ FIX #5: Track position in exit monitor
          await exitMonitor.trackPosition(strategy.id, {
            tradeId: `${strategy.id}-${grid.id}`,
            userId: strategy.userId,
            symbol: strategy.symbol,
            side: "BUY",
            entryPrice: formattedBuyPrice,
            quantity: qty,
            segment: strategy.assetType as "CRYPTO" | "STOCK",
            exchange: strategy.exchange,
            tradeType: strategy.segment as "SPOT" | "FUTURES",
            takeProfit: formattedSellPrice,
            stopLoss: stopLossPrice,
          });

          console.log("[SMART_GRID_BOOTSTRAP_BUY_COMPLETE]", {
            gridId: grid.id,
            investedCapital: state.investedCapital,
            positionTracked: true,
          });
        },
      });

      buyOrdersPlaced++;
    }
  }

  // After bootstrap, transition to RUNNING
  state.lifecycle = "RUNNING";

  console.log("[SMART_GRID_BOOTSTRAP_COMPLETE]", {
    strategyId: strategy.id,
    buyOrdersPlaced,
    totalPendingOrders: state.pendingOrders.size,
    investedCapital: state.investedCapital,
  });
}