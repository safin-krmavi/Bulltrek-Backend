import { randomUUID } from "crypto";
import { GridLevel, HumanGridConfig, SmartGridConfig } from "../../types/strategies/humanGrid.types";

// ✅ Existing Human Grid function
export function generateGridLevels(config: HumanGridConfig): GridLevel[] {
  const { lowerLimit, upperLimit, entryInterval, bookProfitBy } = config;
  const grids: GridLevel[] = [];

  let currentPrice = lowerLimit;
  while (currentPrice <= upperLimit) {
    grids.push({
      id: randomUUID(),
      buyPrice: currentPrice,
      sellPrice: currentPrice + bookProfitBy,
      quantity: 0,
      status: "EMPTY",
    });
    currentPrice += entryInterval;
  }

  return grids;
}

// ✅ NEW: Smart Grid generation
export function generateSmartGridLevels(config: SmartGridConfig): GridLevel[] {
  const { lowerLimit, upperLimit, levels, profitPercentage } = config;
  const grids: GridLevel[] = [];

  const priceRange = upperLimit - lowerLimit;
  const gridInterval = priceRange / levels;

  for (let i = 0; i < levels; i++){
    const buyPrice = lowerLimit + (i * gridInterval);
    const sellPrice = buyPrice * (1 + profitPercentage / 100);

    grids.push({
      id: randomUUID(),
      buyPrice: parseFloat(buyPrice.toFixed(2)),
      sellPrice: parseFloat(sellPrice.toFixed(2)),
      quantity: 0,
      status: "EMPTY",
    });
  }

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
  if (config.lowerLimit >= config.upperLimit) {
    return { valid: false, error: "Lower limit must be less than upper limit" };
  }

  if (config.levels < 2 || config.levels > 100) {
    return { valid: false, error: "Number of levels must be between 2 and 100" };
  }

  if (config.profitPercentage <= 0) {
    return { valid: false, error: "Profit percentage must be positive" };
  }

  if (config.capital.perGridAmount <= 0 || config.capital.maxCapital <= 0) {
    return { valid: false, error: "Capital amounts must be positive" };
  }

  if (config.capital.maxCapital < config.capital.perGridAmount * config.levels) {
    return { valid: false, error: "Max capital is insufficient for all grid levels" };
  }

  if (config.dataSetDays < 7 || config.dataSetDays > 365) {
    return { valid: false, error: "Data set days must be between 7 and 365" };
  }

  // ✅ NEW: Validate grid spacing is reasonable
  const priceRange = config.upperLimit - config.lowerLimit;
  const gridInterval = priceRange / config.levels;
  const minInterval = config.lowerLimit * 0.001; // 0.1% of lower price

  if (gridInterval < minInterval) {
    return { 
      valid: false, 
      error: `Grid spacing too tight (${gridInterval.toFixed(6)}). Minimum recommended: ${minInterval.toFixed(6)}. Try fewer levels or wider range.`
    };
  }

  // ✅ NEW: Validate profit percentage is achievable given grid spacing
  const minProfitForSpacing = (gridInterval / config.lowerLimit) * 100;
  if (config.profitPercentage < minProfitForSpacing * 0.5) {
    return {
      valid: false,
      error: `Profit target (${config.profitPercentage}%) too small for grid spacing. Minimum recommended: ${(minProfitForSpacing * 0.5).toFixed(2)}%`
    };
  }

  return { valid: true };
}