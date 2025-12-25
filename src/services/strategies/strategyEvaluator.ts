import { Strategy } from "@prisma/client";

type StrategyDecision =
  | { action: "BUY" }
  | { action: "SELL_ENTRY"; entryId: string; reason: "BOOK_PROFIT" | "STOP_LOSS" }
  | { action: "SELL_ALL"; reason: "STOP_LOSS" }
  | null;

export function evaluateStrategy(
  strategy: Strategy,
  state: any,
  price: number,
  timestamp: number
): StrategyDecision {
  const config = strategy.config as any;

  /* =========================
     1️⃣ SELL — PER ENTRY TP / SL
     ========================= */
  if (state.entries?.length) {
    for (const entry of state.entries) {
      // Take Profit
      if (
        config.exit?.bookProfit?.enabled &&
        price >= entry.takeProfitPrice
      ) {
        return {
          action: "SELL_ENTRY",
          entryId: entry.id,
          reason: "BOOK_PROFIT",
        };
      }

      // Stop Loss (same logic as TP but downside)
      if (
        config.risk?.stopLoss?.enabled &&
        price <= entry.stopLossPrice
      ) {
        return {
          action: "SELL_ENTRY",
          entryId: entry.id,
          reason: "STOP_LOSS",
        };
      }
    }
  }

  /* =========================
     2️⃣ BUY — PRICE TRIGGER
     ========================= */
  if (config.entry?.priceTrigger?.enabled) {
    if (price > config.entry.priceTrigger.startPrice) return null;
    if (price < config.entry.priceTrigger.stopPrice) return null;
  }

  /* =========================
     3️⃣ BUY — SCHEDULE
     ========================= */
  if (state.lastExecutionAt) {
    const diff = timestamp - state.lastExecutionAt;
    if (diff < getIntervalMs(config.schedule)) return null;
  }

  /* =========================
     4️⃣ BUY — CAPITAL CHECK
     ========================= */
  if (state.investedCapital >= config.capital.maxCapital) {
    return null;
  }

  return { action: "BUY" };
}

function getIntervalMs(schedule: any): number {
  switch (schedule.frequency) {
    case "HOURLY":
      return 60 * 60 * 1000;
    case "DAILY":
      return 24 * 60 * 60 * 1000;
    case "WEEKLY":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
}
