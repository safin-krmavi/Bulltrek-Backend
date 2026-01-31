import { randomUUID } from "crypto";
import { Strategy } from "@prisma/client";
import { evaluateGrowthDCA } from "./evaluators/growthDcaEvaluator";
import { formatQuantity } from "../../utils/crypto/exchange/quantityFormatter";
import { computeNextRunAt } from "../../utils/scheduler/computeNextRunAt";
import prisma from "../../config/db.config";
import { tradeDispatcher } from "./tradeDispatcher";
import { evaluateHumanGrid } from "./evaluators/humanGridEvaluator";
import { HumanGridState } from "../../types/strategies/humanGrid.types";

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
    // console.log("CHECK THIS", state, this.strategy);
    // 1️⃣ Pending order guard
    if (state.pendingOrder) return;

    // 2️⃣ **CRITICAL FIX**: Check if we're past the scheduled time
    if (!state.nextRunAt) {
      // Initialize on first run
      state.nextRunAt = computeNextRunAt(
        config.schedule,
        state.lastExecutionAt ? new Date(state.lastExecutionAt) : new Date(0),
      );
      console.log(
        `[GROWTH_DCA] Initialized nextRunAt for ${this.strategy.id}:`,
        {
          nextRunAt: state.nextRunAt,
        },
      );
    }

    const now = timestamp;
    const scheduledTime = state.nextRunAt.getTime();

    // **KEY FIX**: Only proceed if we're past the scheduled time
    if (now < scheduledTime) {
      // Optional: Log when we're close (within 1 minute) for debugging
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
