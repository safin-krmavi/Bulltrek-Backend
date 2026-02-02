import {
  calculateATR,
  calculateBollingerBands,
} from "../../utils/strategies/gridCalculations";
import { fetchBinanceHistoricalKlines } from "../crypto/exchange/binanceService";
import { fetchBinanceMarketPrice } from "../crypto/exchange/binanceService";

/**
 * Fetch historical OHLC data
 */
async function fetchHistoricalData(
  exchange: string,
  symbol: string,
  interval: string = "1d",
  days: number = 30
): Promise<{
  high: number[];
  low: number[];
  close: number[];
  open: number[];
  historicalHigh: number;
  historicalLow: number;
}> {
  const limit = days;
  const candles = await fetchBinanceHistoricalKlines(symbol, interval, limit);

  const high = candles.map((c: any) => parseFloat(c[2]));
  const low = candles.map((c: any) => parseFloat(c[3]));
  const close = candles.map((c: any) => parseFloat(c[4]));
  const open = candles.map((c: any) => parseFloat(c[1]));

  return {
    high,
    low,
    close,
    open,
    historicalHigh: Math.max(...high),
    historicalLow: Math.min(...low),
  };
}

/**
 * ✅ NEW: Calculate risk level based on volatility
 */
function calculateRiskLevel(atr: number, currentPrice: number): "LOW" | "MEDIUM" | "HIGH" {
  const volatilityPercentage = (atr / currentPrice) * 100;

  if (volatilityPercentage < 2) return "LOW";
  if (volatilityPercentage < 5) return "MEDIUM";
  return "HIGH";
}

/**
 * ✅ NEW: Calculate volatility factor based on risk profile
 */
function getVolatilityFactor(riskLevel: "LOW" | "MEDIUM" | "HIGH"): number {
  switch (riskLevel) {
    case "LOW":
      return 0.5;
    case "MEDIUM":
      return 1.0;
    case "HIGH":
      return 1.5;
    default:
      return 1.0;
  }
}

/**
 * ✅ ENHANCED: Auto-generate Smart Grid parameters using complete explainable flow
 */
export async function generateSmartGridParams(params: {
  exchange: string;
  symbol: string;
  dataSetDays: number;
  userLowerLimit?: number;
  userUpperLimit?: number;
  userLevels?: number;
}) {
  const { exchange, symbol, dataSetDays, userLowerLimit, userUpperLimit, userLevels } = params;

  console.log("[SMART_GRID_AUTO_GEN] Starting limit calculation", {
    symbol,
    dataSetDays,
    hasUserOverrides: !!(userLowerLimit || userUpperLimit),
  });

  // ========================================
  // STEP 1: DATASET SELECTION & FETCHING
  // ========================================
  const { high, low, close, open, historicalHigh, historicalLow } = await fetchHistoricalData(
    exchange,
    symbol,
    "1d",
    dataSetDays
  );

  console.log("[STEP_1] Dataset fetched", {
    candles: close.length,
    historicalRange: `${historicalLow.toFixed(4)} - ${historicalHigh.toFixed(4)}`,
  });

  // ========================================
  // STEP 2: DATA CLEANING (Basic)
  // ========================================
  // Remove extreme outliers (optional - can be enhanced)
  const validCandles = close.filter((c, i) => {
    const avgPrice = (high[i] + low[i]) / 2;
    return Math.abs(c - avgPrice) / avgPrice < 0.5; // Remove >50% price spikes
  });

  if (validCandles.length < close.length * 0.9) {
    console.warn("[STEP_2] Removed abnormal candles", {
      original: close.length,
      cleaned: validCandles.length,
    });
  }

  // ========================================
  // STEP 3: CALCULATE CORE INDICATORS
  // ========================================
  
  // 3.1 Bollinger Bands (Price Distribution)
  const bollinger = calculateBollingerBands(close, 20, 2);
  
  // 3.2 Average True Range (Volatility)
  const atr = calculateATR(high, low, close, 14);

  // 3.3 Get current market price
  const currentPrice = await fetchBinanceMarketPrice({
    symbol,
    assetType: "SPOT", // Adjust based on segment
  });

  if (!currentPrice) {
    throw new Error("Failed to fetch current market price");
  }

  console.log("[STEP_3] Core indicators calculated", {
    bollingerBands: `${bollinger.lower.toFixed(4)} - ${bollinger.upper.toFixed(4)}`,
    atr: atr.toFixed(4),
    currentPrice: currentPrice.toFixed(4),
  });

  // ========================================
  // STEP 4: ESTABLISH RAW PROBABILISTIC RANGE
  // ========================================
  let rawLowerLimit = bollinger.lower;
  let rawUpperLimit = bollinger.upper;

  console.log("[STEP_4] Raw probabilistic range", {
    lower: rawLowerLimit.toFixed(4),
    upper: rawUpperLimit.toFixed(4),
  });

  // ========================================
  // STEP 5: VOLATILITY BUFFERING (ATR Adjustment)
  // ========================================
  const riskLevel = calculateRiskLevel(atr, currentPrice);
  const volatilityFactor = getVolatilityFactor(riskLevel);

  let lowerLimit = rawLowerLimit - (atr * volatilityFactor);
  let upperLimit = rawUpperLimit + (atr * volatilityFactor);

  console.log("[STEP_5] Volatility buffering applied", {
    riskLevel,
    volatilityFactor,
    buffer: (atr * volatilityFactor).toFixed(4),
    newRange: `${lowerLimit.toFixed(4)} - ${upperLimit.toFixed(4)}`,
  });

  // ========================================
  // STEP 6: CONTEXTUAL VALIDATION AGAINST CURRENT PRICE
  // ========================================
  const safetyMultiplier = 1.5;
  const minDistance = atr * safetyMultiplier;

  // Check if current price is too close to limits
  const distanceFromLower = currentPrice - lowerLimit;
  const distanceFromUpper = upperLimit - currentPrice;

  if (distanceFromLower < minDistance) {
    console.warn("[STEP_6] Price too close to lower limit, adjusting down");
    lowerLimit = currentPrice - minDistance;
  }

  if (distanceFromUpper < minDistance) {
    console.warn("[STEP_6] Price too close to upper limit, adjusting up");
    upperLimit = currentPrice + minDistance;
  }

  // Ensure current price is inside grid
  if (currentPrice <= lowerLimit || currentPrice >= upperLimit) {
    console.warn("[STEP_6] Current price outside range, recalculating");
    const gridWidth = upperLimit - lowerLimit;
    lowerLimit = currentPrice - (gridWidth * 0.4);
    upperLimit = currentPrice + (gridWidth * 0.6);
  }

  console.log("[STEP_6] Contextual validation complete", {
    currentPrice: currentPrice.toFixed(4),
    distanceFromLower: distanceFromLower.toFixed(4),
    distanceFromUpper: distanceFromUpper.toFixed(4),
    adjustedRange: `${lowerLimit.toFixed(4)} - ${upperLimit.toFixed(4)}`,
  });

  // ========================================
  // STEP 7: HISTORICAL EXTREMES GUARDRAIL
  // ========================================
  const historicalLowerBound = historicalLow - atr;
  const historicalUpperBound = historicalHigh + atr;

  if (lowerLimit < historicalLowerBound) {
    console.warn("[STEP_7] Lower limit below historical bound, clamping");
    lowerLimit = historicalLowerBound;
  }

  if (upperLimit > historicalUpperBound) {
    console.warn("[STEP_7] Upper limit above historical bound, clamping");
    upperLimit = historicalUpperBound;
  }

  console.log("[STEP_7] Historical guardrails applied", {
    historicalBounds: `${historicalLowerBound.toFixed(4)} - ${historicalUpperBound.toFixed(4)}`,
    finalRange: `${lowerLimit.toFixed(4)} - ${upperLimit.toFixed(4)}`,
  });

  // ========================================
  // STEP 8: RISK & CAPITAL FEASIBILITY CHECK
  // ========================================
  const priceRange = upperLimit - lowerLimit;
  const suggestedLevels = Math.max(5, Math.min(50, Math.floor(priceRange / (atr * 2))));
  const finalLevels = userLevels || suggestedLevels;

  const gridSpacing = priceRange / finalLevels;
  const minSpacing = lowerLimit * 0.001; // 0.1% minimum

  if (gridSpacing < minSpacing) {
    console.warn("[STEP_8] Grid spacing too tight, reducing levels");
    const adjustedLevels = Math.floor(priceRange / minSpacing);
    console.log(`[STEP_8] Adjusted levels: ${finalLevels} → ${adjustedLevels}`);
  }

  console.log("[STEP_8] Feasibility check complete", {
    gridSpacing: gridSpacing.toFixed(6),
    suggestedLevels,
    finalLevels,
    riskLevel,
  });

  // ========================================
  // STEP 9: APPLY USER OVERRIDES (if provided)
  // ========================================
  const finalLowerLimit = userLowerLimit || lowerLimit;
  const finalUpperLimit = userUpperLimit || upperLimit;

  if (userLowerLimit || userUpperLimit) {
    console.log("[STEP_9] User overrides applied", {
      userLower: userLowerLimit,
      userUpper: userUpperLimit,
    });
  }

  // ========================================
  // FINAL OUTPUT
  // ========================================
  const result = {
    lowerLimit: parseFloat(finalLowerLimit.toFixed(2)),
    upperLimit: parseFloat(finalUpperLimit.toFixed(2)),
    levels: finalLevels,
    indicators: {
      bollingerUpper: parseFloat(bollinger.upper.toFixed(2)),
      bollingerLower: parseFloat(bollinger.lower.toFixed(2)),
      bollingerMiddle: parseFloat(bollinger.middle.toFixed(2)),
      atr: parseFloat(atr.toFixed(4)),
      historicalHigh: parseFloat(historicalHigh.toFixed(2)),
      historicalLow: parseFloat(historicalLow.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      volatilityFactor,
      riskLevel,
    },
    dataSetDays,
  };

  console.log("[SMART_GRID_AUTO_GEN_COMPLETE]", {
    symbol,
    finalRange: `${result.lowerLimit} - ${result.upperLimit}`,
    levels: result.levels,
    riskLevel: result.indicators.riskLevel,
    autoGenerated: !userLowerLimit && !userUpperLimit,
  });

  return result;
}