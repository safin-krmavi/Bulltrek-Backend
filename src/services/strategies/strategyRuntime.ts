import { randomUUID } from "crypto";
import { Strategy } from "@prisma/client";
import { evaluateGrowthDCA } from "./evaluators/growthDcaEvaluator";
import { formatQuantity } from "../../utils/crypto/exchange/quantityFormatter";
import { computeNextRunAt } from "../../utils/scheduler/computeNextRunAt";
import prisma from "../../config/db.config";
import { tradeDispatcher } from "./tradeDispatcher";
import { evaluateHumanGrid } from "./evaluators/humanGridEvaluator";
import { HumanGridState } from "../../types/strategies/humanGrid.types";
import { evaluateUTC } from "./evaluators/utcEvaluator";
import { UTCState } from "../../types/strategies/utc.types";
import { evaluateIndyTrend } from "./evaluators/indyTrendEvaluator";
import { IndyTrendState } from "../../types/strategies/indyTrend.types";
import { Candle } from "../../utils/strategies/historicalDataFetcher.js";

// Base runtime state
type BaseStrategyRuntimeState = {
  investedCapital: number;
  positionQty: number;
  avgEntryPrice: number | null;
  lastExecutionAt: number | null;
  nextRunAt: Date | null;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
};

type DCAEntry = {
  id: string;
  quantity: number;
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
};

type GrowthDCAState = {
  investedCapital: number;
  entries: DCAEntry[];
  lastExecutionAt: number | null;
  nextRunAt: Date | null;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  pendingOrder?: boolean;
};

// Map strategy type to state type
type StrategyStateMap = {
  GROWTH_DCA: GrowthDCAState;
  HUMAN_GRID: HumanGridState;
  UTC: UTCState;
  INDY_TREND: IndyTrendState;
  SCALPING: BaseStrategyRuntimeState;
  GRID: BaseStrategyRuntimeState;
  // Add future strategies here
};

export class StrategyRuntime<
  T extends keyof StrategyStateMap = keyof StrategyStateMap,
> {
  private strategy: Strategy;
  public state: StrategyStateMap[T];
  public active: boolean = false;

  constructor(strategy: Strategy) {
    this.strategy = strategy;

    switch (strategy.type) {
      case "GROWTH_DCA":
        // **FIX**: Initialize nextRunAt properly
        const lastExecution = strategy.lastExecutedAt
          ? strategy.lastExecutedAt.getTime()
          : null;

        this.state = {
          investedCapital: 0,
          entries: [],
          lastExecutionAt: lastExecution,
          nextRunAt: computeNextRunAt(
            (strategy.config as any).schedule,
            strategy.lastExecutedAt || new Date(0),
          ),
          status: "ACTIVE",
        } as StrategyStateMap[T];

        console.log("[STRATEGY_RUNTIME_INIT]", {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          type: strategy.type,
          lastExecutedAt: strategy.lastExecutedAt?.toISOString(),
          nextRunAt: (this.state as GrowthDCAState).nextRunAt?.toISOString(),
        });
        break;

      case "HUMAN_GRID":
        const gridConfig = strategy.config as any;
        this.state = {
          grids: gridConfig.grids || [],
          investedCapital: 0,
          lastExecutionAt: null,
          status: "ACTIVE",
          pendingOrders: new Set<string>(),
        } as StrategyStateMap[T];
        break;

      case "UTC":
        this.state = {
          investedCapital: 0,
          positionQty: 0,
          avgEntryPrice: null,
          lastExecutionAt: null,
          status: "ACTIVE",
          pendingOrder: false,
          utBotBuyTrailingStop: 0,
          utBotSellTrailingStop: 0,
          stcValue: 0,
          previousSTCValue: 0,
          currentPosition: "NONE",
        } as StrategyStateMap[T];
        break;

      case "INDY_TREND":
        this.state = {
          investedCapital: 0,
          positionQty: 0,
          avgEntryPrice: null,
          lastExecutionAt: null,
          status: "ACTIVE",
          currentPosition: "NONE",
          cooldownUntil: null,
          consecutiveLosses: 0,
          pausedUntil: null,
          pendingOrder: false,
        } as StrategyStateMap[T];
        break;

      default:
        this.state = {
          investedCapital: 0,
          positionQty: 0,
          avgEntryPrice: null,
          lastExecutionAt: null,
          nextRunAt: null,
          status: "ACTIVE",
        } as StrategyStateMap[T];
    }

    console.log("[STRATEGY_RUNTIME_INIT]", {
      strategyId: strategy.id,
      symbol: strategy.symbol,
      type: strategy.type,
    });
  }

  /**
   * Called on every market tick
   */
  onMarketTick(price: number, timestamp: number) {
    // **REMOVED**: if (!this.active) return;
    // The scheduling is now handled INSIDE each strategy handler
    if (this.state.status !== "ACTIVE") return;
    // console.log("THIS");

    switch (this.strategy.type) {
      case "GROWTH_DCA":
        this.handleGrowthDCA(price, timestamp);
        break;

      case "HUMAN_GRID":
        this.handleHumanGrid(price, timestamp);
        break;

      case "UTC":
        // UTC uses candle close events, not price ticks
        // this.handleUTC(price, timestamp);
        break;
    }
  }

  /**
   * Called when a candle closes (for UTC and INDY_TREND strategies)
   */
  onCandleClose(price: number, timestamp: number, candles: any[]) {
    if (this.state.status !== "ACTIVE") return;

    if (this.strategy.type === "UTC") {
      this.handleUTC(price, timestamp, candles);
    }

    if (this.strategy.type === "INDY_TREND") {
      this.handleIndyTrend(price, timestamp, candles);
    }
  }

  async executeScheduled(price: number = 0) {
    if (this.state.status !== "ACTIVE") return;
    this.active = true;

    if (this.strategy.type === "GROWTH_DCA") {
      this.handleGrowthDCA(price, Date.now());

      // ✅ Only update nextRunAt for Growth DCA
      const growthState = this.state as GrowthDCAState;
      growthState.lastExecutionAt = Date.now();
      growthState.nextRunAt = computeNextRunAt(
        (this.strategy.config as any).schedule,
        new Date(),
      );
    }

    this.active = false;
  }

  /**
   * Handles Growth-DCA logic
   */

  private async handleGrowthDCA(price: number, timestamp: number) {
    const config = this.strategy.config as any;
    const state = this.state as GrowthDCAState;

    if (state.pendingOrder) return;

    if (!state.nextRunAt) {
      state.nextRunAt = computeNextRunAt(
        config.schedule,
        state.lastExecutionAt ? new Date(state.lastExecutionAt) : new Date(0)
      );
      console.log(`[GROWTH_DCA] Initialized nextRunAt for ${this.strategy.id}:`, {
        nextRunAt: state.nextRunAt,
      });
    }

    const now = timestamp;
    const scheduledTime = state.nextRunAt.getTime();

    // ✅ FIX: Add 10-second tolerance window for execution
    const executionWindow = 10 * 1000; // 10 seconds
    const timeDiff = now - scheduledTime;

    // Only proceed if we're within the execution window
    if (timeDiff < 0) {
      // Too early
      if (scheduledTime - now < 60000) {
        console.log(`[GROWTH_DCA] Waiting for schedule:`, {
          strategyId: this.strategy.id,
          scheduledTime: new Date(scheduledTime).toISOString(),
          currentTime: new Date(now).toISOString(),
          secondsRemaining: Math.floor((scheduledTime - now) / 1000),
        });
      }
      return;
    }

    if (timeDiff > executionWindow) {
      // ❌ Too late - skip this execution
      console.warn(`[GROWTH_DCA] Execution window missed, skipping`, {
        strategyId: this.strategy.id,
        scheduledTime: new Date(scheduledTime).toISOString(),
        currentTime: new Date(now).toISOString(),
        delaySeconds: Math.floor(timeDiff / 1000),
        windowSeconds: executionWindow / 1000,
      });

      // Calculate next run time
      state.nextRunAt = computeNextRunAt(config.schedule, new Date(now));
      console.log(`[GROWTH_DCA] Next run scheduled for:`, state.nextRunAt.toISOString());
      return;
    }

    // ✅ Within execution window - proceed
    console.log(`[GROWTH_DCA] Executing within window`, {
      strategyId: this.strategy.id,
      scheduledTime: new Date(scheduledTime).toISOString(),
      executionTime: new Date(now).toISOString(),
      delaySeconds: Math.floor(timeDiff / 1000),
    });

    // 3️⃣ Investment cap check
    if (
      state.investedCapital + config.capital.perOrderAmount >
      config.capital.maxCapital
    ) {
      console.log(`[GROWTH_DCA] Investment cap reached:`, {
        strategyId: this.strategy.id,
        invested: state.investedCapital,
        maxCapital: config.capital.maxCapital,
      });
      return;
    }

    if (!price || price <= 0) {
      console.log("INVALID PRICE", price);
      return;
    }

    // 4️⃣ Evaluate decision
    const decision = evaluateGrowthDCA(this.strategy, state, price, timestamp);

    console.log("[GROWTH_DCA] Evaluate decision", {
      strategyId: this.strategy.id,
      decision,
      price,
      scheduledTime: new Date(scheduledTime).toISOString(),
      executionTime: new Date(now).toISOString(),
    });

    if (decision === "BUY") {
      const perOrder = config.capital.perOrderAmount;
      const qty = await formatQuantity({
        exchange: this.strategy.exchange,
        tradeType: this.strategy.segment,
        symbol: this.strategy.symbol,
        rawQty: perOrder / price,
      });

      console.log("BUY", qty, {
        exchange: this.strategy.exchange,
        tradeType: this.strategy.segment,
        symbol: this.strategy.symbol,
        rawQty: perOrder / price,
      });

      const takeProfitPrice = config.exit.bookProfit.enabled
        ? price * (1 + config.exit.bookProfit.percentage / 100)
        : 0;

      const stopLossPrice = config.risk.stopLoss.enabled
        ? price * (1 - config.risk.stopLoss.percentage / 100)
        : 0;

      const entry: DCAEntry = {
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

      // **CRITICAL**: Update nextRunAt IMMEDIATELY after execution
      state.nextRunAt = computeNextRunAt(config.schedule, new Date(timestamp));

      console.log("[GROWTH_DCA] Placing BUY order", {
        strategyId: this.strategy.id,
        price,
        qty,
        executionTime: new Date(timestamp).toISOString(),
        nextScheduledRun: state.nextRunAt.toISOString(),
        totalInvested: state.investedCapital,
        entriesCount: state.entries.length,
      });

      // Update DB
      await prisma.strategy.update({
        where: { id: this.strategy.id },
        data: { lastExecutedAt: new Date(state.lastExecutionAt) },
      });

      tradeDispatcher.dispatch({
        userId: this.strategy.userId,
        exchange: this.strategy.exchange,
        segment: this.strategy.assetType as "CRYPTO" | "STOCK",
        tradeType: this.strategy.segment as any,
        symbol: this.strategy.symbol,
        side: "BUY",
        quantity: qty,
        price,
        orderType: "MARKET",
        strategyId: this.strategy.id,
        onComplete: () => {
          state.pendingOrder = false;
        },
      });

      return;
    }

    // 5️⃣ SELL logic (unchanged)
    for (const entry of state.entries) {
      if (config.exit.bookProfit.enabled && price >= entry.takeProfitPrice) {
        console.log("[GROWTH_DCA] Trigger BOOK_PROFIT sell", {
          strategyId: this.strategy.id,
          entryId: entry.id,
          price,
          takeProfitPrice: entry.takeProfitPrice,
        });
        this.sellEntry(entry, price, "BOOK_PROFIT");
        return;
      }

      if (config.risk.stopLoss.enabled && price <= entry.stopLossPrice) {
        console.log("[GROWTH_DCA] Trigger STOP_LOSS sell", {
          strategyId: this.strategy.id,
          entryId: entry.id,
          price,
          stopLossPrice: entry.stopLossPrice,
        });
        this.sellEntry(entry, price, "STOP_LOSS");
        return;
      }
    }
  }

  private async sellEntry(
    entry: DCAEntry,
    price: number,
    reason: "BOOK_PROFIT" | "STOP_LOSS",
  ) {
    const state = this.state as GrowthDCAState;
    state.pendingOrder = true;

    console.log("[GROWTH_DCA_SELL_ENTRY]", {
      strategyId: this.strategy.id,
      entryId: entry.id,
      reason,
      price,
    });

    tradeDispatcher.dispatch({
      userId: this.strategy.userId,
      exchange: this.strategy.exchange,
      segment: this.strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: this.strategy.segment as any,
      symbol: this.strategy.symbol,
      side: "SELL",
      quantity: entry.quantity,
      price,
      orderType: "MARKET",
      strategyId: this.strategy.id,

      onComplete: () => {
        // 3️⃣ Update state ONLY after successful SELL
        state.entries = state.entries.filter((e) => e.id !== entry.id);
        state.investedCapital -= entry.quantity * entry.entryPrice;
        state.pendingOrder = false;

        console.log("[GROWTH_DCA_SELL_COMPLETE]", {
          strategyId: this.strategy.id,
          entryId: entry.id,
          remainingEntries: state.entries.length,
          investedCapital: state.investedCapital,
        });
      },
    });
  }

  /**
   * Handles Human-Grid logic
   */

  private async handleHumanGrid(price: number, timestamp: number) {
    const decision = evaluateHumanGrid(
      this.strategy,
      this.state as HumanGridState,
      price,
    );

    if (decision.action === "HOLD") {
      return;
    }

    const state = this.state as HumanGridState;
    const config = this.strategy.config as any;

    if (decision.action === "BUY" && decision.gridId) {
      // Check investment cap
      const potentialInvestment =
        state.investedCapital + config.capital.perGridAmount;
      if (potentialInvestment > config.capital.maxCapital) {
        console.log("[HUMAN_GRID] Investment cap reached");
        return;
      }

      // Mark as pending to avoid duplicate orders
      state.pendingOrders.add(decision.gridId);

      // Calculate stop loss if enabled
      const stopLossPrice = config.stopLossPercentage
        ? price * (1 - config.stopLossPercentage / 100)
        : undefined;

      await tradeDispatcher.dispatch({
        userId: this.strategy.userId,
        exchange: this.strategy.exchange,
        segment: this.strategy.assetType as "CRYPTO" | "STOCK",
        tradeType: this.strategy.segment as "SPOT" | "FUTURES",
        symbol: this.strategy.symbol,
        side: "BUY",
        quantity: decision.quantity!,
        price: decision.price!,
        takeProfit: decision.price! + config.bookProfitBy,
        stopLoss: stopLossPrice,
        orderType: "LIMIT",
        strategyId: this.strategy.id,
        onComplete: () => {
          // Update grid state after successful buy
          const grid = state.grids.find((g) => g.id === decision.gridId);
          if (grid) {
            grid.status = "BOUGHT";
            grid.quantity = decision.quantity!;
            state.investedCapital += config.capital.perGridAmount;
          }
          state.pendingOrders.delete(decision.gridId!);
          state.lastExecutionAt = timestamp;
        },
      });
    }

    if (decision.action === "SELL" && decision.gridId) {
      state.pendingOrders.add(decision.gridId);

      await tradeDispatcher.dispatch({
        userId: this.strategy.userId,
        exchange: this.strategy.exchange,
        segment: this.strategy.assetType as "CRYPTO" | "STOCK",
        tradeType: this.strategy.segment as "SPOT" | "FUTURES",
        symbol: this.strategy.symbol,
        side: "SELL",
        quantity: decision.quantity!,
        price: decision.price!,
        orderType: "LIMIT",
        strategyId: this.strategy.id,
        onComplete: () => {
          // Update grid state after successful sell
          const grid = state.grids.find((g) => g.id === decision.gridId);
          if (grid) {
            grid.status = "EMPTY";
            grid.quantity = 0;
            state.investedCapital -= config.capital.perGridAmount;
          }
          state.pendingOrders.delete(decision.gridId!);
          state.lastExecutionAt = timestamp;
        },
      });
    }
  }

  /**
   * Handles UTC (UT Bot + STC) strategy logic
   */
  private async handleUTC(price: number, timestamp: number, candles?: any[]) {
    const state = this.state as UTCState;
    const config = this.strategy.config as any;

    if (state.pendingOrder) return;

    // Use provided candles or fetch if not available
    let historicalCandles = candles;

    if (!historicalCandles) {
      // Fallback: fetch historical candles
      const minCandles = Math.max(
        config.buyAtrPeriod + 10,
        config.stcLength * 2 + 50
      );

      try {
        historicalCandles = await this.fetchHistoricalCandles(
          this.strategy.exchange,
          this.strategy.segment,
          this.strategy.symbol,
          config.timeFrame || "5m",
          minCandles
        );
      } catch (error: any) {
        console.error("[UTC] Error fetching candles", {
          strategyId: this.strategy.id,
          error: error.message,
        });
        return;
      }
    }

    try {
      // Evaluate UTC strategy
      const decision = evaluateUTC(
        this.strategy,
        state,
        price,
        historicalCandles
      );

      console.log("[UTC] Decision", {
        strategyId: this.strategy.id,
        action: decision.action,
        reason: decision.reason,
        price,
        candleCount: historicalCandles.length,
      });

      if (decision.action === "BUY") {
        const perOrder = config.capital.perOrderAmount;
        const qty = await formatQuantity({
          exchange: this.strategy.exchange,
          tradeType: this.strategy.segment,
          symbol: this.strategy.symbol,
          rawQty: perOrder / price,
        });

        state.pendingOrder = true;
        state.lastExecutionAt = timestamp;

        console.log("[UTC] Placing BUY order", {
          strategyId: this.strategy.id,
          price,
          qty,
          investmentAmount: perOrder,
        });

        tradeDispatcher.dispatch({
          userId: this.strategy.userId,
          exchange: this.strategy.exchange,
          segment: this.strategy.assetType as "CRYPTO" | "STOCK",
          tradeType: this.strategy.segment as any,
          symbol: this.strategy.symbol,
          side: "BUY",
          quantity: qty,
          price,
          orderType: "MARKET",
          strategyId: this.strategy.id,
          onComplete: () => {
            // Update state after successful buy
            const totalCost = qty * price;
            const newTotalQty = state.positionQty + qty;
            const newTotalCost = (state.avgEntryPrice || 0) * state.positionQty + totalCost;

            state.avgEntryPrice = newTotalCost / newTotalQty;
            state.positionQty = newTotalQty;
            state.investedCapital += perOrder;
            state.currentPosition = "LONG";
            state.pendingOrder = false;

            console.log("[UTC] BUY completed", {
              strategyId: this.strategy.id,
              avgEntryPrice: state.avgEntryPrice,
              positionQty: state.positionQty,
              investedCapital: state.investedCapital,
            });
          },
        });
      } else if (decision.action === "SELL" && decision.quantity) {
        state.pendingOrder = true;

        console.log("[UTC] Placing SELL order", {
          strategyId: this.strategy.id,
          price,
          qty: decision.quantity,
          reason: decision.reason,
        });

        tradeDispatcher.dispatch({
          userId: this.strategy.userId,
          exchange: this.strategy.exchange,
          segment: this.strategy.assetType as "CRYPTO" | "STOCK",
          tradeType: this.strategy.segment as any,
          symbol: this.strategy.symbol,
          side: "SELL",
          quantity: decision.quantity,
          price,
          orderType: "MARKET",
          strategyId: this.strategy.id,
          onComplete: () => {
            // Update state after successful sell
            const soldValue = decision.quantity! * price;
            state.investedCapital -= soldValue;
            state.positionQty = 0;
            state.avgEntryPrice = null;
            state.currentPosition = "NONE";
            state.pendingOrder = false;

            console.log("[UTC] SELL completed", {
              strategyId: this.strategy.id,
              soldValue,
              investedCapital: state.investedCapital,
            });
          },
        });
      }
    } catch (error: any) {
      console.error("[UTC] Error", {
        strategyId: this.strategy.id,
        error: error.message,
      });
    }
  }

  /**
   * Handles INDY TREND (Supertrend + RSI + ADX) strategy logic
   */
  private async handleIndyTrend(price: number, timestamp: number, candles?: Candle[]) {
    const state = this.state as IndyTrendState;
    const config = this.strategy.config as any;

    if (state.pendingOrder) return;

    // Use provided candles or fetch if not available
    let historicalCandles = candles;

    if (!historicalCandles) {
      const minCandles = Math.max(
        config.supertrend.atrLength + 10,
        config.rsi.length + 10,
        config.adx.diLength + config.adx.smoothing + 10
      );

      try {
        historicalCandles = await this.fetchHistoricalCandles(
          this.strategy.exchange,
          this.strategy.segment,
          this.strategy.symbol,
          config.timeFrame || "5m",
          minCandles
        );
      } catch (error: any) {
        console.error("[INDY_TREND] Error fetching candles", {
          strategyId: this.strategy.id,
          error: error.message,
        });
        return;
      }
    }

    try {
      // Evaluate INDY TREND strategy
      const decision = evaluateIndyTrend(
        this.strategy,
        state,
        price,
        historicalCandles
      );

      console.log("[INDY_TREND] Decision", {
        strategyId: this.strategy.id,
        action: decision.action,
        reason: decision.reason,
        price,
        candleCount: historicalCandles.length,
      });

      if (decision.action === "BUY") {
        // Calculate quantity based on leverage (if Futures)
        const investmentAmount = config.investment;
        const leverage = config.leverage || 1;
        const rawQty = config.leverage
          ? (investmentAmount * leverage) / price
          : investmentAmount / price;

        const qty = await formatQuantity({
          exchange: this.strategy.exchange,
          tradeType: this.strategy.segment,
          symbol: this.strategy.symbol,
          rawQty,
        });

        state.pendingOrder = true;
        state.lastExecutionAt = timestamp;

        console.log("[INDY_TREND] Placing BUY order (LONG)", {
          strategyId: this.strategy.id,
          price,
          qty,
          investmentAmount,
          leverage,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
        });

        tradeDispatcher.dispatch({
          userId: this.strategy.userId,
          exchange: this.strategy.exchange,
          segment: this.strategy.assetType as "CRYPTO" | "STOCK",
          tradeType: this.strategy.segment as any,
          symbol: this.strategy.symbol,
          side: "BUY",
          quantity: qty,
          price,
          orderType: "MARKET",
          strategyId: this.strategy.id,
          onComplete: () => {
            // Update state after successful buy
            const totalCost = qty * price;
            const newTotalQty = state.positionQty + qty;
            const newTotalCost = (state.avgEntryPrice || 0) * state.positionQty + totalCost;

            state.avgEntryPrice = newTotalCost / newTotalQty;
            state.positionQty = newTotalQty;
            state.investedCapital += investmentAmount;
            state.currentPosition = "LONG";
            state.pendingOrder = false;

            console.log("[INDY_TREND] BUY completed", {
              strategyId: this.strategy.id,
              avgEntryPrice: state.avgEntryPrice,
              positionQty: state.positionQty,
              investedCapital: state.investedCapital,
            });
          },
        });
      } else if (decision.action === "SELL" && decision.quantity) {
        state.pendingOrder = true;

        const isProfit = decision.reason.includes("Take Profit");
        const isLoss = decision.reason.includes("Stop Loss");

        console.log("[INDY_TREND] Placing SELL order", {
          strategyId: this.strategy.id,
          price,
          qty: decision.quantity,
          reason: decision.reason,
          isProfit,
          isLoss,
        });

        tradeDispatcher.dispatch({
          userId: this.strategy.userId,
          exchange: this.strategy.exchange,
          segment: this.strategy.assetType as "CRYPTO" | "STOCK",
          tradeType: this.strategy.segment as any,
          symbol: this.strategy.symbol,
          side: "SELL",
          quantity: decision.quantity,
          price,
          orderType: "MARKET",
          strategyId: this.strategy.id,
          onComplete: () => {
            // Update state after successful sell
            const soldValue = decision.quantity! * price;
            state.investedCapital -= soldValue;
            state.positionQty = 0;
            state.avgEntryPrice = null;
            state.currentPosition = "NONE";
            state.pendingOrder = false;

            // Set cooldown (1 candle = 5 minutes)
            const timeFrameMs = this.getTimeFrameMs(config.timeFrame || "5m");
            state.cooldownUntil = timestamp + timeFrameMs;

            // Track consecutive losses
            if (isLoss) {
              state.consecutiveLosses += 1;
              if (state.consecutiveLosses >= 3) {
                // Pause for 1 hour after 3 consecutive losses
                state.pausedUntil = timestamp + (60 * 60 * 1000);
                console.warn("[INDY_TREND] Strategy paused due to 3 consecutive losses", {
                  strategyId: this.strategy.id,
                  pausedUntil: new Date(state.pausedUntil).toISOString(),
                });
              }
            } else if (isProfit) {
              // Reset consecutive losses on profit
              state.consecutiveLosses = 0;
            }

            console.log("[INDY_TREND] SELL completed", {
              strategyId: this.strategy.id,
              soldValue,
              investedCapital: state.investedCapital,
              cooldownUntil: new Date(state.cooldownUntil).toISOString(),
              consecutiveLosses: state.consecutiveLosses,
            });
          },
        });
      }
    } catch (error: any) {
      console.error("[INDY_TREND] Error", {
        strategyId: this.strategy.id,
        error: error.message,
      });
    }
  }

  /**
   * Convert timeframe string to milliseconds
   */
  private getTimeFrameMs(timeFrame: string): number {
    const value = parseInt(timeFrame);
    const unit = timeFrame.replace(/[0-9]/g, "").toLowerCase();

    switch (unit) {
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 5 * 60 * 1000; // Default 5 minutes
    }
  }

  /**
   * Fetch historical candles from exchange
   * Helper method for UTC and INDY_TREND strategies
   */
  private async fetchHistoricalCandles(
    exchange: string,
    segment: string,
    symbol: string,
    interval: string,
    limit: number
  ): Promise<any[]> {
    // Import exchange services
    if (exchange === "BINANCE") {
      const { fetchBinanceHistoricalKlines } = await import(
        "../../services/crypto/exchange/binanceService.js"
      );
      return await fetchBinanceHistoricalKlines(symbol, interval, limit, segment as any);
    } else if (exchange === "KUCOIN") {
      const { fetchKucoinHistoricalKlines } = await import(
        "../../services/crypto/exchange/kucoinService.js"
      );
      return await fetchKucoinHistoricalKlines(symbol, interval, limit, segment as any);
    } else if (exchange === "COINDCX") {
      const { fetchCoinDCXHistoricalKlines } = await import(
        "../../services/crypto/exchange/coindcxService.js"
      );
      return await fetchCoinDCXHistoricalKlines(symbol, interval, limit, segment as any);
    }

    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  /**
   * Stop strategy
   */
  stop() {
    this.state.status = "STOPPED";
    this.active = false;
    console.log("[STRATEGY_STOPPED]", this.strategy.id);
  }

  // Optional future methods:
  // private handleScalping(price: number, timestamp: number) {}
  // private handleGrid(price: number, timestamp: number) {}
}
