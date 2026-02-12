import { fetchBinanceHistoricalKlines, fetchBinanceMarketPrice } from "../crypto/exchange/binanceService";
import { fetchKucoinHistoricalKlines, fetchKucoinMarketPrice } from "../crypto/exchange/kucoinService";
import { fetchCoinDCXHistoricalKlines, fetchCoinDCXMarketPrice } from "../crypto/exchange/coindcxService";

/**
 * Calculate minimum investment per grid based on exchange requirements
 * 
 * This function determines a sensible minimum investment amount by considering:
 * 1. Exchange minimum order value (e.g., Binance SPOT minimum ~$10)
 * 2. Reasonable percentage of total investment (2%)
 */
function calculateMinimumInvestment(params: {
  exchange: string;
  segment: "SPOT" | "FUTURES";
  totalInvestment: number;
}): number {
  const { exchange, segment, totalInvestment } = params;

  // Exchange minimum order values (in USD)
  let exchangeMinimumUSD: number;

  switch (exchange.toUpperCase()) {
    case "BINANCE":
      exchangeMinimumUSD = segment === "SPOT" ? 10 : 5; // SPOT: $10, FUTURES: $5
      break;
    case "KUCOIN":
      exchangeMinimumUSD = segment === "SPOT" ? 1 : 1; // KuCoin has lower minimums
      break;
    case "COINDCX":
      exchangeMinimumUSD = 10; // CoinDCX minimum
      break;
    default:
      exchangeMinimumUSD = 10; // Safe default
  }

  // Minimum should be at least 2% of total investment
  // This ensures we don't create too many tiny grids
  const percentageBasedMinimum = totalInvestment * 0.02;

  // Use whichever is higher: exchange minimum or 2% of investment
  const calculatedMinimum = Math.max(exchangeMinimumUSD, percentageBasedMinimum);

  // Round to 2 decimal places
  return parseFloat(calculatedMinimum.toFixed(2));
}

/**
 * Calculate recommended investment amount
 * Used when user doesn't provide investment - auto-calculates based on:
 * 1. Minimum investment per grid
 * 2. Estimated number of grid levels
 * 3. Safety multiplier (1.5x for flexibility)
 */
function calculateRecommendedInvestment(params: {
  minimumInvestment: number;
  estimatedLevels: number;
}): number {
  const { minimumInvestment, estimatedLevels } = params;

  // Safety multiplier: 1.5x to ensure sufficient capital
  const safetyMultiplier = 1.5;

  // Investment = (minimum per grid) × (estimated levels) × (safety multiplier)
  const recommended = minimumInvestment * estimatedLevels * safetyMultiplier;

  // Round to nearest 10 for cleaner numbers (e.g., 150 instead of 147.5)
  const rounded = Math.ceil(recommended / 10) * 10;

  console.log("[CALCULATE_RECOMMENDED_INVESTMENT]", {
    minimumInvestment,
    estimatedLevels,
    safetyMultiplier,
    rawRecommended: recommended,
    roundedRecommended: rounded,
  });

  return rounded;
}


/**
 * Fetch historical OHLC data from any exchange
 */
async function fetchHistoricalData(
  exchange: string,
  symbol: string,
  interval: string = "1d",
  days: number = 30,
  segment: "SPOT" | "FUTURES" = "SPOT"
): Promise<{
  high: number[];
  low: number[];
  close: number[];
  open: number[];
  historicalHigh: number;
  historicalLow: number;
}> {
  const limit = days;
  let candles: any[] = [];

  console.log("[FETCH_HISTORICAL_DATA] Starting", {
    exchange,
    symbol,
    interval,
    days,
    segment,
  });

  // ✅ Fetch from appropriate exchange
  if (exchange === "BINANCE") {
    candles = await fetchBinanceHistoricalKlines(symbol, interval, limit, segment);
  } else if (exchange === "KUCOIN") {
    candles = await fetchKucoinHistoricalKlines(symbol, interval, limit, segment);
  } else if (exchange === "COINDCX") {
    candles = await fetchCoinDCXHistoricalKlines(symbol, interval, limit, segment);
  } else {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  if (!candles || candles.length === 0) {
    throw new Error(`No historical data available for ${symbol} on ${exchange}`);
  }

  // ✅ Parse OHLC data (format is same across all exchanges: [time, open, high, low, close, ...])
  const high = candles.map((c: any) => parseFloat(c[2]));
  const low = candles.map((c: any) => parseFloat(c[3]));
  const close = candles.map((c: any) => parseFloat(c[4]));
  const open = candles.map((c: any) => parseFloat(c[1]));

  console.log("[FETCH_HISTORICAL_DATA] Success", {
    exchange,
    symbol,
    segment,
    candlesCount: candles.length,
    priceRange: `${Math.min(...low).toFixed(4)} - ${Math.max(...high).toFixed(4)}`,
  });

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
 * Fetch current market price from any exchange
 */
async function fetchMarketPrice(
  exchange: string,
  symbol: string,
  segment: "SPOT" | "FUTURES" = "SPOT"
): Promise<number> {
  console.log("[FETCH_MARKET_PRICE] Starting", {
    exchange,
    symbol,
    segment,
  });

  let price: number | null = null;

  // ✅ Fetch from appropriate exchange
  if (exchange === "BINANCE") {
    price = await fetchBinanceMarketPrice({ symbol, assetType: segment });
  } else if (exchange === "KUCOIN") {
    price = await fetchKucoinMarketPrice({ symbol, assetType: segment });
  } else if (exchange === "COINDCX") {
    price = await fetchCoinDCXMarketPrice({ symbol, assetType: segment });
  } else {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  if (!price || price <= 0) {
    throw new Error(`Failed to fetch current price for ${symbol} on ${exchange}`);
  }

  console.log("[FETCH_MARKET_PRICE] Success", {
    exchange,
    symbol,
    segment,
    price,
  });

  return price;
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(data: number[], period: number): number {
  if (data.length < period) {
    throw new Error(`Insufficient data for SMA calculation. Need ${period}, got ${data.length}`);
  }
  const slice = data.slice(-period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): {
  upper: number;
  middle: number;
  lower: number;
} {
  const middle = calculateSMA(prices, period);
  const slice = prices.slice(-period);

  const variance =
    slice.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);

  return {
    upper: middle + stdDev * standardDeviation,
    middle,
    lower: middle - stdDev * standardDeviation,
  };
}

/**
 * Calculate Average True Range (ATR)
 */
function calculateATR(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): number {
  const trueRanges: number[] = [];

  for (let i = 1; i < high.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    trueRanges.push(tr);
  }

  return calculateSMA(trueRanges, period);
}

/**
 * Calculate risk level based on volatility
 */
function calculateRiskLevel(atr: number, currentPrice: number): "LOW" | "MEDIUM" | "HIGH" {
  const atrPercent = (atr / currentPrice) * 100;

  if (atrPercent < 2) return "LOW";
  if (atrPercent < 5) return "MEDIUM";
  return "HIGH";
}

/**
 * Calculate optimal grid levels based on price range and volatility
 * CRITICAL: Must ensure investment per level >= minimumInvestment
 */
function calculateOptimalLevels(
  lowerLimit: number,
  upperLimit: number,
  minimumInvestment: number,
  totalInvestment: number
): number {
  const priceRange = upperLimit - lowerLimit;

  // ✅ HARD CONSTRAINT: Maximum levels we can afford
  const maxAffordableLevels = Math.floor(totalInvestment / minimumInvestment);

  // ✅ Calculate optimal levels based on 2% price spacing
  const optimalSpacing = priceRange * 0.02; // 2% of range
  const optimalLevels = Math.ceil(priceRange / optimalSpacing);

  // ✅ CRITICAL: Return whichever is SMALLER to ensure we never violate minimum investment
  // Also enforce minimum of 5 levels and maximum of 50 levels
  const safeLevels = Math.min(optimalLevels, maxAffordableLevels);
  const finalLevels = Math.min(Math.max(5, safeLevels), 50);

  console.log("[CALCULATE_OPTIMAL_LEVELS]", {
    priceRange: priceRange.toFixed(4),
    optimalSpacing: optimalSpacing.toFixed(4),
    optimalLevels,
    maxAffordableLevels,
    safeLevels,
    finalLevels,
    investmentPerLevel: (totalInvestment / finalLevels).toFixed(2),
    minimumRequired: minimumInvestment,
  });

  return finalLevels;
}

/**
 * Calculate profit percentage based on volatility and grid spacing
 */
function calculateOptimalProfitPercentage(
  lowerLimit: number,
  upperLimit: number,
  levels: number,
  volatilityFactor: number
): number {
  const gridSpacing = (upperLimit - lowerLimit) / levels;
  const spacingPercent = (gridSpacing / lowerLimit) * 100;

  // ✅ Profit should be at least 50% of grid spacing, adjusted by volatility
  const baseProfitPercent = spacingPercent * 0.5 * volatilityFactor;

  // ✅ Clamp between 0.5% and 10%
  return Math.max(0.5, Math.min(10, baseProfitPercent));
}

/**
 * ✅ COMPLETE: Auto-generate Smart Grid parameters
 */
export async function generateSmartGridParams(params: {
  exchange: string;
  symbol: string;
  dataSetDays: number;
  segment?: "SPOT" | "FUTURES";
  investment?: number; // ✅ Made optional
  minimumInvestment?: number;
  userLowerLimit?: number;
  userUpperLimit?: number;
  userLevels?: number;
  userProfitPercentage?: number;
  // ✅ NEW: Additional user overrides
  userPerGridAmount?: number;
  userInvestment?: number;
  userMinInvestment?: number;
}) {
  const {
    exchange,
    symbol,
    dataSetDays,
    segment = "SPOT",
    investment: legacyInvestment, // Legacy parameter for backward compatibility
    minimumInvestment: legacyMinimumInvestment,
    userLowerLimit,
    userUpperLimit,
    userLevels,
    userProfitPercentage,
    // ✅ NEW: User overrides
    userPerGridAmount,
    userInvestment,
    userMinInvestment,
  } = params;


  // ========================================
  // STEP 1: FETCH HISTORICAL DATA
  // ========================================
  const { high, low, close, open, historicalHigh, historicalLow } =
    await fetchHistoricalData(exchange, symbol, "1d", dataSetDays, segment);

  console.log("[STEP_1] Historical data fetched", {
    candles: close.length,
    segment,
    historicalRange: `${historicalLow.toFixed(4)} - ${historicalHigh.toFixed(4)}`,
  });

  // ========================================
  // STEP 1.5: CALCULATE INVESTMENT PARAMETERS WITH USER OVERRIDES
  // ========================================
  // ✅ NEW: Smart recalculation based on what user provides

  // First, calculate base minimum investment
  const baseMinimumInvestment = userMinInvestment || legacyMinimumInvestment || calculateMinimumInvestment({
    exchange,
    segment,
    totalInvestment: 100, // Temporary value for calculation
  });

  let finalInvestment: number;
  let finalPerGridAmount: number;
  let finalMinimumInvestment: number = baseMinimumInvestment;
  let calculatedLevels: number | undefined;

  // Priority 1: User provides BOTH investment and perGridAmount → calculate levels
  if (userInvestment && userPerGridAmount) {
    finalInvestment = userInvestment;
    finalPerGridAmount = userPerGridAmount;
    calculatedLevels = Math.round(finalInvestment / finalPerGridAmount);

    console.log("[STEP_1.5] User provided investment + perGridAmount", {
      userInvestment: finalInvestment,
      userPerGridAmount: finalPerGridAmount,
      calculatedLevels,
      source: "calculated from investment/perGridAmount",
    });
  }
  // Priority 2: User provides investment + levels → calculate perGridAmount
  else if ((userInvestment || legacyInvestment) && userLevels) {
    finalInvestment = userInvestment || legacyInvestment!;
    calculatedLevels = userLevels;
    finalPerGridAmount = finalInvestment / calculatedLevels;

    console.log("[STEP_1.5] User provided investment + levels", {
      userInvestment: finalInvestment,
      userLevels: calculatedLevels,
      calculatedPerGridAmount: finalPerGridAmount,
      source: "calculated from investment/levels",
    });
  }
  // Priority 3: User provides perGridAmount + levels → calculate investment
  else if (userPerGridAmount && userLevels) {
    finalPerGridAmount = userPerGridAmount;
    calculatedLevels = userLevels;
    finalInvestment = finalPerGridAmount * calculatedLevels;

    console.log("[STEP_1.5] User provided perGridAmount + levels", {
      userPerGridAmount: finalPerGridAmount,
      userLevels: calculatedLevels,
      calculatedInvestment: finalInvestment,
      source: "calculated from perGridAmount*levels",
    });
  }
  // Priority 4: User provides only investment → auto-calculate rest
  else if (userInvestment || legacyInvestment) {
    finalInvestment = userInvestment || legacyInvestment!;
    // Will calculate perGridAmount after levels are determined
    finalPerGridAmount = 0; // Placeholder

    console.log("[STEP_1.5] User provided only investment", {
      userInvestment: finalInvestment,
      note: "perGridAmount will be calculated after levels",
    });
  }
  // Priority 5: No user overrides → full auto-calculation
  else {
    // Auto-calculate investment based on market analysis
    const priceRange = historicalHigh - historicalLow;
    const estimatedInterval = priceRange * 0.02;
    const estimatedLevels = Math.ceil(priceRange / estimatedInterval);

    finalInvestment = calculateRecommendedInvestment({
      minimumInvestment: baseMinimumInvestment,
      estimatedLevels: Math.min(estimatedLevels, 20),
    });
    finalPerGridAmount = 0; // Placeholder

    console.log("[STEP_1.5] Full auto-calculation", {
      priceRange: priceRange.toFixed(4),
      estimatedLevels,
      cappedLevels: Math.min(estimatedLevels, 20),
      recommendedInvestment: finalInvestment,
    });
  }

  // Store for later use
  let investment = finalInvestment;
  let minimumInvestment = finalMinimumInvestment;

  // ========================================
  // STEP 2: CALCULATE INDICATORS
  // ========================================
  const bollinger = calculateBollingerBands(close, 20, 2);
  const atr = calculateATR(high, low, close, 14);
  const currentPrice = await fetchMarketPrice(exchange, symbol, segment);

  const volatilityFactor = (atr / currentPrice) * 100;
  const riskLevel = calculateRiskLevel(atr, currentPrice);

  console.log("[STEP_2] Indicators calculated", {
    bollinger: `${bollinger.lower.toFixed(4)} - ${bollinger.upper.toFixed(4)}`,
    atr: atr.toFixed(4),
    currentPrice: currentPrice.toFixed(4),
    volatilityFactor: volatilityFactor.toFixed(2) + "%",
    riskLevel,
  });

  // ========================================
  // STEP 3: CALCULATE GRID LIMITS
  // ========================================
  let lowerLimit: number;
  let upperLimit: number;

  if (userLowerLimit !== undefined && userUpperLimit !== undefined) {
    // ✅ User provided limits
    lowerLimit = userLowerLimit;
    upperLimit = userUpperLimit;
    console.log("[STEP_3] Using user-provided limits", {
      lowerLimit,
      upperLimit,
    });
  } else {
    // ✅ Auto-calculate with volatility buffering
    const bufferPercent = Math.max(5, Math.min(15, volatilityFactor * 2));
    const buffer = (atr * bufferPercent) / 100;

    lowerLimit = Math.max(
      historicalLow * 0.95,
      Math.min(bollinger.lower - buffer, currentPrice * 0.9)
    );

    upperLimit = Math.min(
      historicalHigh * 1.05,
      Math.max(bollinger.upper + buffer, currentPrice * 1.1)
    );

    console.log("[STEP_3] Auto-calculated limits", {
      lowerLimit: lowerLimit.toFixed(4),
      upperLimit: upperLimit.toFixed(4),
      buffer: buffer.toFixed(4),
      bufferPercent: bufferPercent.toFixed(2) + "%",
    });
  }

  // ========================================
  // STEP 4: CALCULATE OPTIMAL LEVELS
  // ========================================
  // ✅ Use calculated levels if available, otherwise user override or auto-calculate
  const levels = calculatedLevels || userLevels || calculateOptimalLevels(
    lowerLimit,
    upperLimit,
    minimumInvestment,
    investment
  );

  // ✅ Now calculate perGridAmount if not already set
  const perGridAmount = finalPerGridAmount || (investment / levels);

  console.log("[STEP_4] Levels and perGridAmount finalized", {
    levels,
    perGridAmount: perGridAmount.toFixed(2),
    totalInvestment: investment.toFixed(2),
    source: calculatedLevels ? "calculated" : (userLevels ? "user-provided" : "auto-calculated"),
  });

  // ========================================
  // STEP 5: CALCULATE PROFIT PERCENTAGE
  // ========================================
  const profitPercentage = userProfitPercentage || calculateOptimalProfitPercentage(
    lowerLimit,
    upperLimit,
    levels,
    Math.max(1, volatilityFactor / 3)
  );

  console.log("[STEP_5] Profit percentage calculated", {
    profitPercentage: profitPercentage.toFixed(2) + "%",
    userProvided: !!userProfitPercentage,
  });

  // ========================================
  // STEP 6: VALIDATE CONFIGURATION
  // ========================================
  const perLevelInvestment = perGridAmount;
  const minimumInvestmentRequired = levels * minimumInvestment;
  const maxAffordableLevels = Math.floor(investment / minimumInvestment);

  // ✅ Validate consistency: perGridAmount * levels should equal investment
  const calculatedInvestment = perGridAmount * levels;
  if (Math.abs(calculatedInvestment - investment) > 0.01) {
    throw new Error(
      `Parameter inconsistency detected:\n` +
      `- perGridAmount: ${perGridAmount.toFixed(2)}\n` +
      `- levels: ${levels}\n` +
      `- perGridAmount × levels = ${calculatedInvestment.toFixed(2)}\n` +
      `- investment: ${investment.toFixed(2)}\n\n` +
      `These values must be consistent. Please adjust your parameters.`
    );
  }

  if (perLevelInvestment < minimumInvestment) {
    throw new Error(
      `Configuration invalid:\n` +
      `- Levels: ${levels}\n` +
      `- Minimum investment required: ${minimumInvestmentRequired.toFixed(2)}\n` +
      `- Your investment: ${investment.toFixed(2)}\n` +
      `- Per grid: ${perLevelInvestment.toFixed(2)} (minimum: ${minimumInvestment.toFixed(2)})\n\n` +
      `Options:\n` +
      `1. Increase investment to ${minimumInvestmentRequired.toFixed(2)}\n` +
      `2. Reduce levels to ${maxAffordableLevels}\n` +
      `3. Increase perGridAmount to ${minimumInvestment.toFixed(2)}`
    );
  }

  const gridSpacing = (upperLimit - lowerLimit) / levels;
  const minSpacing = lowerLimit * 0.001; // 0.1% of lower limit

  if (gridSpacing < minSpacing) {
    throw new Error(
      `Grid spacing too tight (${gridSpacing.toFixed(6)}). ` +
      `Minimum recommended: ${minSpacing.toFixed(6)}. Try fewer levels or wider range.`
    );
  }

  console.log("[STEP_6] Validation passed", {
    perLevelInvestment: perLevelInvestment.toFixed(2),
    minimumInvestmentRequired: minimumInvestmentRequired.toFixed(2),
    maxAffordableLevels,
    gridSpacing: gridSpacing.toFixed(6),
    spacingPercent: ((gridSpacing / lowerLimit) * 100).toFixed(2) + "%",
  });

  // ========================================
  // RETURN COMPLETE CONFIGURATION
  // ========================================
  const result = {
    exchange,
    symbol,
    segment,
    dataSetDays,

    // ✅ Grid parameters
    lowerLimit: parseFloat(lowerLimit.toFixed(6)),
    upperLimit: parseFloat(upperLimit.toFixed(6)),
    levels,
    profitPercentage: parseFloat(profitPercentage.toFixed(2)),

    // ✅ Investment parameters
    investment: parseFloat(investment.toFixed(2)),
    minimumInvestment: parseFloat(minimumInvestment.toFixed(2)),
    perLevelInvestment: parseFloat(perGridAmount.toFixed(2)), // ✅ Now uses calculated perGridAmount
    perGridAmount: parseFloat(perGridAmount.toFixed(2)), // ✅ NEW: Expose perGridAmount explicitly

    // ✅ Validation info
    validation: {
      isValid: true,
      minimumInvestmentRequired: parseFloat(minimumInvestmentRequired.toFixed(2)),
      currentPerLevelInvestment: parseFloat(perLevelInvestment.toFixed(2)),
      maxAffordableLevels,
    },

    // ✅ Market indicators
    indicators: {
      // Backward compatibility - flat structure
      bollingerUpper: parseFloat(bollinger.upper.toFixed(6)),
      bollingerMiddle: parseFloat(bollinger.middle.toFixed(6)),
      bollingerLower: parseFloat(bollinger.lower.toFixed(6)),
      atr: parseFloat(atr.toFixed(6)),
      historicalHigh: parseFloat(historicalHigh.toFixed(6)),
      historicalLow: parseFloat(historicalLow.toFixed(6)),
      currentPrice: parseFloat(currentPrice.toFixed(6)),
      volatilityFactor: parseFloat(volatilityFactor.toFixed(2)),
      riskLevel,
    },
  };

  console.log("[SMART_GRID_AUTO_GEN] Complete", {
    range: `${result.lowerLimit} - ${result.upperLimit}`,
    levels: result.levels,
    profitPercentage: result.profitPercentage + "%",
    perLevelInvestment: result.perLevelInvestment,
    riskLevel: result.indicators.riskLevel,
  });

  return result;
}