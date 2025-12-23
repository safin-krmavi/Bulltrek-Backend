import { randomUUID } from "crypto";
import { CryptoExchange, Strategy } from "@prisma/client";
import { evaluateGrowthDCA } from "./evaluators/growthDcaEvaluator";
import { tradeExecutionEngine } from "./tradeExecutionEngine";
import { getCryptoCredentials } from "../crypto/credentialsService";
import { formatQuantity } from "../../utils/crypto/exchange/quantityFormatter";
// import other strategy evaluators here when ready

// Base runtime state
type BaseStrategyRuntimeState = {
  investedCapital: number;
  positionQty: number;
  avgEntryPrice: number | null;
  lastExecutionAt: number | null;
  status: "RUNNING" | "PAUSED" | "STOPPED";
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
  status: "RUNNING" | "PAUSED" | "STOPPED";
  pendingOrder?: boolean;
};

// Map strategy type to state type
type StrategyStateMap = {
  GROWTH_DCA: GrowthDCAState;
  SCALPING: BaseStrategyRuntimeState;
  GRID: BaseStrategyRuntimeState;
  // Add future strategies here
};

export class StrategyRuntime<
  T extends keyof StrategyStateMap = keyof StrategyStateMap
> {
  private strategy: Strategy;
  public state: StrategyStateMap[T];

  constructor(strategy: Strategy) {
    this.strategy = strategy;

    // Initialize state depending on strategy type
    switch (strategy.type) {
      case "GROWTH_DCA":
        this.state = {
          investedCapital: 0,
          entries: [],
          lastExecutionAt: null,
          status: "RUNNING",
        } as StrategyStateMap[T];
        break;

      case "SCALPING":
      case "GRID":
      default:
        this.state = {
          investedCapital: 0,
          positionQty: 0,
          avgEntryPrice: null,
          lastExecutionAt: null,
          status: "RUNNING",
        } as StrategyStateMap[T];
        break;
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
    if (this.state.status !== "RUNNING") return;

    // console.log("[STRATEGY_TICK]", {
    //   strategyId: this.strategy.id,
    //   symbol: this.strategy.symbol,
    //   price,
    // });

    switch (this.strategy.type) {
      case "GROWTH_DCA":
        this.handleGrowthDCA(price, timestamp);
        break;

      case "SCALPING":
        // this.handleScalping(price, timestamp);
        break;

      case "GRID":
        // this.handleGrid(price, timestamp);
        break;

      default:
        console.warn("[STRATEGY_UNKNOWN_TYPE]", {
          strategyId: this.strategy.id,
          type: this.strategy.type,
        });
        break;
    }
  }

  /**
   * Handles Growth-DCA logic
   */

  private async handleGrowthDCA(price: number, timestamp: number) {
    const config = this.strategy.config as any;
    const state = this.state as GrowthDCAState;

    // console.log("[GROWTH_DCA] Tick received", {
    //   strategyId: this.strategy.id,
    //   price,
    //   timestamp,
    //   investedCapital: state.investedCapital,
    //   entriesCount: state.entries.length,
    //   pendingOrder: state.pendingOrder,
    // });

    if (state.pendingOrder) {
      console.log("[GROWTH_DCA] Skipping tick because pending order exists");
      return;
    }

    const decision = evaluateGrowthDCA(this.strategy, state, price, timestamp);
    console.log("[GROWTH_DCA] Evaluate decision", { decision });

    if (decision === "BUY") {
      const perOrder = config.capital.perOrderAmount;

      const rawQty = perOrder / price;

      const qty = await formatQuantity({
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

      console.log("[GROWTH_DCA] Placing BUY order", {
        strategyId: this.strategy.id,
        price,
        qty,
        takeProfitPrice,
        stopLossPrice,
        totalInvested: state.investedCapital,
        entriesCount: state.entries.length,
      });

      const rawCredentials = await getCryptoCredentials(
        this.strategy.userId,
        this.strategy.exchange as CryptoExchange
      );
      const credentials = Array.isArray(rawCredentials)
        ? rawCredentials[0]
        : rawCredentials;

      if (!credentials) {
        console.warn("[TRADE_SKIPPED_NO_CREDENTIALS]", {
          strategyId: this.strategy.id,
        });
        return;
      }

      tradeExecutionEngine.enqueue(
        {
          userId: this.strategy.userId,
          exchange: this.strategy.exchange as any,
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
        },
        credentials
      );

      return;
    }

    // SELL — handle take profit / stop loss per entry
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

    console.log("[GROWTH_DCA] No action taken on this tick", {
      strategyId: this.strategy.id,
      price,
      entriesCount: state.entries.length,
      investedCapital: state.investedCapital,
    });
  }

  private async sellEntry(
    entry: DCAEntry,
    price: number,
    reason: "BOOK_PROFIT" | "STOP_LOSS"
  ) {
    const state = this.state as GrowthDCAState;

    const rawCredentials = await getCryptoCredentials(
      this.strategy.userId,
      this.strategy.exchange as CryptoExchange
    );
    const credentials = Array.isArray(rawCredentials)
      ? rawCredentials[0]
      : rawCredentials;

    if (!credentials) {
      console.warn("[TRADE_SKIPPED_NO_CREDENTIALS]", {
        strategyId: this.strategy.id,
      });
      return;
    }
    tradeExecutionEngine.enqueue(
      {
        userId: this.strategy.userId,
        exchange: this.strategy.exchange as CryptoExchange,
        tradeType: this.strategy.segment as any,
        symbol: this.strategy.symbol,
        side: "SELL",
        quantity: entry.quantity,
        price,
        orderType: "MARKET",
        strategyId: this.strategy.id,
        onComplete: () => {
          state.pendingOrder = false;
        },
      },
      credentials
    );

    state.entries = state.entries.filter((e) => e.id !== entry.id);
    state.investedCapital -= entry.quantity * entry.entryPrice;
    state.pendingOrder = true;

    console.log("[GROWTH_DCA_SELL_ENTRY]", {
      strategyId: this.strategy.id,
      entryId: entry.id,
      reason,
      price,
    });
  }

  /**
   * Stop strategy
   */
  stop() {
    this.state.status = "STOPPED";
    console.log("[STRATEGY_STOPPED]", this.strategy.id);
  }

  // Optional future methods:
  // private handleScalping(price: number, timestamp: number) {}
  // private handleGrid(price: number, timestamp: number) {}
}
