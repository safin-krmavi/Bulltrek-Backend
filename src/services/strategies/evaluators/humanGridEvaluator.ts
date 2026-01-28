import { Strategy } from "@prisma/client";
import { HumanGridState, SmartGridState, GridDecision } from "../../../types/strategies/humanGrid.types";

// ✅ Existing Human Grid Evaluator
export function evaluateHumanGrid(
  strategy: Strategy,
  state: HumanGridState,
  currentPrice: number
): GridDecision {
  const config = strategy.config as any;

  // Check if price is outside grid range
  if (currentPrice < config.lowerLimit || currentPrice > config.upperLimit) {
    return {
      action: "HOLD",
      reason: "Price outside grid range",
    };
  }

  // Find the nearest grid level to current price
  const nearestGrid = state.grids.reduce((prev, curr) => {
    const prevDiff = Math.abs(prev.buyPrice - currentPrice);
    const currDiff = Math.abs(curr.buyPrice - currentPrice);
    return currDiff < prevDiff ? curr : prev;
  });

  // Check for BUY opportunity
  if (
    nearestGrid.status === "EMPTY" &&
    !state.pendingOrders.has(nearestGrid.id) &&
    currentPrice <= nearestGrid.buyPrice
  ) {
    return {
      action: "BUY",
      price: nearestGrid.buyPrice,
      quantity: config.capital.perGridAmount,
      gridId: nearestGrid.id,
      reason: "Price reached buy level",
    };
  }

  // Check for SELL opportunity
  if (
    nearestGrid.status === "BOUGHT" &&
    !state.pendingOrders.has(nearestGrid.id) &&
    currentPrice >= nearestGrid.sellPrice
  ) {
    return {
      action: "SELL",
      price: nearestGrid.sellPrice,
      quantity: nearestGrid.quantity,
      gridId: nearestGrid.id,
      reason: "Price reached sell level",
    };
  }

  return {
    action: "HOLD",
    reason: "No grid level triggered",
  };
}

// ✅ NEW: Smart Grid Evaluator
export function evaluateSmartGrid(
  strategy: Strategy,
  state: SmartGridState,
  currentPrice: number
): GridDecision {
  const config = strategy.config as any;

  // Check if price is outside grid range
  if (currentPrice < config.lowerLimit || currentPrice > config.upperLimit) {
    return {
      action: "HOLD",
      reason: "Price outside smart grid range",
    };
  }

  // Find the nearest grid level to current price
  const sortedGrids = [...state.grids].sort((a, b) => a.buyPrice - b.buyPrice);
  
  let nearestBuyGrid = null;
  let nearestSellGrid = null;

  // Find nearest BUY opportunity (EMPTY grid below current price)
  for (let i = sortedGrids.length - 1; i >= 0; i--) {
    const grid = sortedGrids[i];
    if (
      grid.status === "EMPTY" &&
      !state.pendingOrders.has(grid.id) &&
      currentPrice <= grid.buyPrice * 1.001 // 0.1% tolerance
    ) {
      nearestBuyGrid = grid;
      break;
    }
  }

  // Find nearest SELL opportunity (BOUGHT grid above current price)
  for (let i = 0; i < sortedGrids.length; i++) {
    const grid = sortedGrids[i];
    if (
      grid.status === "BOUGHT" &&
      !state.pendingOrders.has(grid.id) &&
      currentPrice >= grid.sellPrice * 0.999 // 0.1% tolerance
    ) {
      nearestSellGrid = grid;
      break;
    }
  }

  // Prioritize SELL over BUY (take profits first)
  if (nearestSellGrid) {
    return {
      action: "SELL",
      price: nearestSellGrid.sellPrice,
      quantity: nearestSellGrid.quantity,
      gridId: nearestSellGrid.id,
      reason: "Smart grid sell level reached",
    };
  }

  if (nearestBuyGrid) {
    return {
      action: "BUY",
      price: nearestBuyGrid.buyPrice,
      quantity: config.capital.perGridAmount,
      gridId: nearestBuyGrid.id,
      reason: "Smart grid buy level reached",
    };
  }

  return {
    action: "HOLD",
    reason: "No smart grid level triggered",
  };
}

// ✅ Existing function
export function calculateGridStatistics(state: HumanGridState | SmartGridState) {
  const totalGrids = state.grids.length;
  const filledGrids = state.grids.filter((g) => g.status === "BOUGHT").length;
  const emptyGrids = state.grids.filter((g) => g.status === "EMPTY").length;

  return {
    totalGrids,
    filledGrids,
    emptyGrids,
    fillRate: (filledGrids / totalGrids) * 100,
    investedCapital: state.investedCapital,
  };
}