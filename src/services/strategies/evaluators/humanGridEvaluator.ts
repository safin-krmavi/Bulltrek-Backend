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

  // Find ALL eligible grids for BUY (EMPTY grids at or below current price)
  const eligibleBuyGrids = state.grids.filter(
    (grid) =>
      grid.status === "EMPTY" &&
      !state.pendingOrders.has(grid.id) &&
      currentPrice >= grid.buyPrice * 0.999 // 0.1% tolerance for floating point
  );

  // Find ALL eligible grids for SELL (BOUGHT grids at or above sell price)
  const eligibleSellGrids = state.grids.filter(
    (grid) =>
      grid.status === "BOUGHT" &&
      !state.pendingOrders.has(grid.id) &&
      currentPrice >= grid.sellPrice * 0.999 // 0.1% tolerance
  );

  // Prioritize SELL over BUY (take profits first)
  if (eligibleSellGrids.length > 0) {
    // Sell the grid with the highest sell price first (most profit)
    const gridToSell = eligibleSellGrids.reduce((prev, curr) =>
      curr.sellPrice > prev.sellPrice ? curr : prev
    );

    return {
      action: "SELL",
      price: gridToSell.sellPrice,
      quantity: gridToSell.quantity,
      gridId: gridToSell.id,
      reason: `Price reached sell level (${eligibleSellGrids.length} grids ready)`,
    };
  }

  // Check for BUY opportunity - buy the LOWEST priced eligible grid first
  if (eligibleBuyGrids.length > 0) {
    // Buy the lowest price grid first (closest to lower limit)
    const gridToBuy = eligibleBuyGrids.reduce((prev, curr) =>
      curr.buyPrice < prev.buyPrice ? curr : prev
    );

    return {
      action: "BUY",
      price: gridToBuy.buyPrice,
      quantity: config.capital.perGridAmount,
      gridId: gridToBuy.id,
      reason: `Price reached buy level (${eligibleBuyGrids.length} grids ready)`,
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