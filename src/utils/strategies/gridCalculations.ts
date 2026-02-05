import { randomUUID } from "crypto";
import { GridLevel, HumanGridConfig, SmartGridConfig } from "../../types/strategies/humanGrid.types";

// ✅ Existing Human Grid function
export function generateGridLevels(config: HumanGridConfig): GridLevel[] {
  const { lowerLimit, upperLimit, entryInterval, bookProfitBy } = config;
  const grids: GridLevel[] = [];

  console.log("[GENERATE_GRID_LEVELS] Starting generation", {
    lowerLimit,
    upperLimit,
    entryInterval,
    bookProfitBy,
  });

  const rangeCents = Math.round((upperLimit - lowerLimit) * 1000000);
  const intervalCents = Math.round(entryInterval * 1000000);
  const lowerCents = Math.round(lowerLimit * 1000000);

  const numGrids = Math.floor(rangeCents / intervalCents) + 1;

  console.log("[GENERATE_GRID_LEVELS] Calculation details", {
    rangeCents,
    intervalCents,
    lowerCents,
    expectedGrids: numGrids,
  });

  for (let i = 0; i < numGrids; i++) {
    const currentPriceCents = lowerCents + (i * intervalCents);
    const currentPrice = currentPriceCents / 1000000;

    // ✅ Safety check: Stop if we exceed upper limit
    if (currentPrice > upperLimit + 0.0000001) {
      console.log("[GENERATE_GRID_LEVELS] Reached upper limit, stopping", {
        currentPrice,
        upperLimit,
        gridNumber: i + 1,
      });
      break;
    }

    const buyPrice = parseFloat(currentPrice.toFixed(6));
    const sellPrice = parseFloat((currentPrice + bookProfitBy).toFixed(6));

    grids.push({
      id: randomUUID(),
      buyPrice,
      sellPrice,
      quantity: 0,
      status: "EMPTY",
    });

    console.log("[GRID_LEVEL_GENERATED]", {
      gridNumber: i + 1,
      id: grids[i].id,
      buyPrice,
      sellPrice,
      currentPrice: currentPrice.toFixed(6),
      withinRange: currentPrice >= lowerLimit && currentPrice <= upperLimit, // ✅ Add validation
    });

    if (i >= 1000) {
      console.error("[GRID_GENERATION_ERROR] Too many grids generated");
      break;
    }
  }

  // ✅ Final validation
  const invalidGrids = grids.filter(g => 
    g.buyPrice < lowerLimit || g.buyPrice > upperLimit
  );

  if (invalidGrids.length > 0) {
    console.error("[GRID_GENERATION_VALIDATION_ERROR]", {
      invalidGrids: invalidGrids.map(g => g.buyPrice),
      range: `${lowerLimit} - ${upperLimit}`,
    });
  }

  console.log("[GENERATE_GRID_LEVELS_COMPLETE]", {
    totalGrids: grids.length,
    firstGrid: grids[0]?.buyPrice,
    lastGrid: grids[grids.length - 1]?.buyPrice,
    allLevels: grids.map(g => g.buyPrice),
    allWithinRange: grids.every(g => 
      g.buyPrice >= lowerLimit && g.buyPrice <= upperLimit
    ), // ✅ Validation flag
  });

  return grids;
}

// ✅ NEW: Smart Grid generation
export function generateSmartGridLevels(config: SmartGridConfig): GridLevel[] {
  const { lowerLimit, upperLimit, levels, profitPercentage } = config;
  const grids: GridLevel[] = [];

  const priceRange = upperLimit! - lowerLimit!;
  const gridInterval = priceRange / levels;

  console.log("[GENERATE_SMART_GRID_LEVELS] Starting generation", {
    lowerLimit,
    upperLimit,
    levels,
    profitPercentage,
    gridInterval,
  });

  for (let i = 0; i < levels; i++) {
    const buyPrice = lowerLimit! + (i * gridInterval);
    
    // ✅ Calculate sell price based on profit percentage
    const sellPrice = buyPrice * (1 + profitPercentage / 100);

    grids.push({
      id: randomUUID(),
      buyPrice: parseFloat(buyPrice.toFixed(2)),
      sellPrice: parseFloat(sellPrice.toFixed(2)),
      quantity: 0,
      status: "EMPTY",
    });

    console.log("[SMART_GRID_LEVEL_GENERATED]", {
      levelNumber: i + 1,
      buyPrice: buyPrice.toFixed(2),
      sellPrice: sellPrice.toFixed(2),
      profitAmount: (sellPrice - buyPrice).toFixed(2),
      profitPercent: profitPercentage,
    });
  }

  console.log("[GENERATE_SMART_GRID_LEVELS_COMPLETE]", {
    totalLevels: grids.length,
    firstLevel: `${grids[0]?.buyPrice} → ${grids[0]?.sellPrice}`,
    lastLevel: `${grids[grids.length - 1]?.buyPrice} → ${grids[grids.length - 1]?.sellPrice}`,
    avgProfitPerLevel: ((grids[0]?.sellPrice - grids[0]?.buyPrice) / grids[0]?.buyPrice * 100).toFixed(2) + "%",
  });

  return grids;
}

// ✅ NEW: Calculate Bollinger Bands
export function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): {
  upper: number;
  middle: number;
  lower: number;
} {
  if (prices.length < period) {
    throw new Error(`Not enough data points. Need at least ${period}, got ${prices.length}`);
  }

  const recentPrices = prices.slice(-period);
  const sum = recentPrices.reduce((acc, price) => acc + price, 0);
  const mean = sum / period;

  const squaredDiffs = recentPrices.map(price => Math.pow(price - mean, 2));
  const variance = squaredDiffs.reduce((acc, diff) => acc + diff, 0) / period;
  const standardDeviation = Math.sqrt(variance);

  return {
    upper: mean + (standardDeviation * stdDev),
    middle: mean,
    lower: mean - (standardDeviation * stdDev),
  };
}

// ✅ NEW: Calculate ATR (Average True Range)
export function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    throw new Error(`Not enough data for ATR calculation. Need at least ${period + 1} periods`);
  }

  const trueRanges: number[] = [];

  for (let i = 1; i < Math.min(highs.length, lows.length, closes.length); i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    trueRanges.push(tr);
  }

  const recentTR = trueRanges.slice(-period);
  const atr = recentTR.reduce((acc, tr) => acc + tr, 0) / period;

  return atr;
}

// ✅ Existing Human Grid validation
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
    return { valid: false, error: "Book profit value must be positive" };
  }

const rawGridCount =
  (config.upperLimit - config.lowerLimit) / config.entryInterval;

const numberOfGrids = Math.floor(rawGridCount + 1e-9) + 1;
if (numberOfGrids < 2) {
  return { valid: false, error: "Grid configuration results in too few levels (minimum 2 required)" };
}

if (numberOfGrids > 500) {
  return { valid: false, error: "Grid configuration results in too many levels (maximum 100 allowed)" };
}

  return { valid: true };
}

// ✅ NEW: Smart Grid validation
export function validateSmartGridConfig(config: SmartGridConfig): {
  valid: boolean;
  error?: string;
} {
  // Validate type
  if (!["NEUTRAL", "LONG", "SHORT"].includes(config.type)) {
    return { valid: false, error: "type must be NEUTRAL, LONG, or SHORT" };
  }

  // Skip limit validation if auto-generated
  if (config.lowerLimit !== undefined && config.upperLimit !== undefined) {
    if (config.lowerLimit >= config.upperLimit) {
      return { valid: false, error: "Lower limit must be less than upper limit" };
    }
  }

  if (config.levels < 2 || config.levels > 100) {
    return { valid: false, error: "Number of levels must be between 2 and 100" };
  }

  if (config.profitPercentage <= 0) {
    return { valid: false, error: "Profit percentage must be positive" };
  }

  if (config.investment <= 0 || config.minimumInvestment <= 0) {
    return { valid: false, error: "Investment amounts must be positive" };
  }

  if (config.minimumInvestment > config.investment) {
    return { valid: false, error: "Minimum investment cannot exceed total investment" };
  }

  // Validate per-grid amount meets minimum
  const perGridAmount = config.investment / config.levels;
  if (perGridAmount < config.minimumInvestment) {
    return { 
      valid: false, 
      error: `Investment per level (${perGridAmount.toFixed(2)}) is below minimum investment (${config.minimumInvestment}). Reduce levels or increase investment.`
    };
  }

  if (config.dataSetDays < 3 || config.dataSetDays > 365) {
    return { valid: false, error: "Data set days must be between 3 and 365" };
  }

  // Only validate grid spacing if limits are known
  if (config.lowerLimit !== undefined && config.upperLimit !== undefined) {
    const priceRange = config.upperLimit - config.lowerLimit;
    const gridInterval = priceRange / config.levels;
    const minInterval = config.lowerLimit * 0.001;

    if (gridInterval < minInterval) {
      return { 
        valid: false, 
        error: `Grid spacing too tight (${gridInterval.toFixed(6)}). Minimum recommended: ${minInterval.toFixed(6)}. Try fewer levels or wider range.`
      };
    }

    const minProfitForSpacing = (gridInterval / config.lowerLimit) * 100;
    if (config.profitPercentage < minProfitForSpacing * 0.5) {
      return {
        valid: false,
        error: `Profit target (${config.profitPercentage}%) too small for grid spacing. Minimum recommended: ${(minProfitForSpacing * 0.5).toFixed(2)}%`
      };
    }
  }

  return { valid: true };
}