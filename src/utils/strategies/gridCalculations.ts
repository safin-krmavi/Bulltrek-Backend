import { GridLevel, HumanGridConfig } from "../../types/strategies/humanGrid.types";
import { randomUUID } from "crypto";

export function generateGridLevels(config: HumanGridConfig): GridLevel[] {
  const { lowerLimit, upperLimit, entryInterval, bookProfitBy } = config;
  const grids: GridLevel[] = [];

  for (let price = lowerLimit; price <= upperLimit; price += entryInterval) {
    grids.push({
      id: randomUUID(),
      buyPrice: parseFloat(price.toFixed(8)),
      sellPrice: parseFloat((price + bookProfitBy).toFixed(8)),
      quantity: 0,
      status: "EMPTY",
    });
  }

  return grids;
}

export function validateGridConfig(config: HumanGridConfig): {
  valid: boolean;
  error?: string;
} {
  if (config.lowerLimit >= config.upperLimit) {
    return { valid: false, error: "Lower limit must be less than upper limit" };
  }

  if (config.entryInterval <= 0) {
    return { valid: false, error: "Entry interval must be positive" };
  }

  if (config.bookProfitBy <= 0) {
    return { valid: false, error: "Book profit must be positive" };
  }

  const gridCount =
    Math.floor((config.upperLimit - config.lowerLimit) / config.entryInterval) + 1;

  if (gridCount < 2) {
    return { valid: false, error: "Grid must have at least 2 levels" };
  }

  if (gridCount > 100) {
    return {
      valid: false,
      error: `Too many grids (${gridCount}). Maximum 100 allowed.`,
    };
  }

  const totalCapitalRequired = gridCount * config.capital.perGridAmount;
  if (totalCapitalRequired > config.capital.maxCapital) {
    return {
      valid: false,
      error: `Total capital required (${totalCapitalRequired}) exceeds max capital (${config.capital.maxCapital})`,
    };
  }

  return { valid: true };
}

export function findActiveGridForPrice(
  grids: GridLevel[],
  currentPrice: number,
  action: "BUY" | "SELL"
): GridLevel | null {
  for (const grid of grids) {
    if (action === "BUY" && grid.status === "EMPTY" && currentPrice <= grid.buyPrice) {
      return grid;
    }
    if (action === "SELL" && grid.status === "BOUGHT" && currentPrice >= grid.sellPrice) {
      return grid;
    }
  }
  return null;
}