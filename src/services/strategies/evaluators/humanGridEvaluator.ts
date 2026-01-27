import { Strategy } from "@prisma/client";
import { HumanGridState, HumanGridConfig } from "../../../types/strategies/humanGrid.types";
import { findActiveGridForPrice } from "../../../utils/strategies/gridCalculations";

type GridDecision = {
  action: "BUY" | "SELL" | "HOLD";
  gridId?: string;
  quantity?: number;
  price?: number;
  reason?: string;
};

export function evaluateHumanGrid(
  strategy: Strategy,
  state: HumanGridState,
  currentPrice: number
): GridDecision {
  const config = strategy.config as HumanGridConfig;

  // Check if price is outside grid range
  if (currentPrice < config.lowerLimit) {
    return { action: "HOLD", reason: "PRICE_BELOW_GRID_RANGE" };
  }

  if (currentPrice > config.upperLimit) {
    return { action: "HOLD", reason: "PRICE_ABOVE_GRID_RANGE" };
  }

  // Check investment cap
  if (state.investedCapital >= config.capital.maxCapital) {
    return { action: "HOLD", reason: "INVESTMENT_CAP_REACHED" };
  }

  // Check for BUY opportunity
  const buyGrid = findActiveGridForPrice(state.grids, currentPrice, "BUY");
  if (buyGrid && !state.pendingOrders.has(buyGrid.id)) {
    const quantity =
      strategy.assetType === "STOCK"
        ? config.capital.perGridAmount // Number of shares
        : config.capital.perGridAmount / currentPrice; // Crypto quantity

    return {
      action: "BUY",
      gridId: buyGrid.id,
      quantity,
      price: currentPrice,
      reason: "GRID_BUY_TRIGGERED",
    };
  }

  // Check for SELL opportunity
  const sellGrid = findActiveGridForPrice(state.grids, currentPrice, "SELL");
  if (sellGrid && !state.pendingOrders.has(sellGrid.id)) {
    return {
      action: "SELL",
      gridId: sellGrid.id,
      quantity: sellGrid.quantity,
      price: currentPrice,
      reason: "GRID_SELL_TRIGGERED",
    };
  }

  return { action: "HOLD", reason: "NO_GRID_TRIGGER" };
}

export function calculateGridStatistics(state: HumanGridState) {
  const emptyGrids = state.grids.filter((g) => g.status === "EMPTY").length;
  const filledGrids = state.grids.filter((g) => g.status === "BOUGHT").length;
  const totalGrids = state.grids.length;

  return {
    totalGrids,
    emptyGrids,
    filledGrids,
    utilizationRate: (filledGrids / totalGrids) * 100,
    investedCapital: state.investedCapital,
  };
}