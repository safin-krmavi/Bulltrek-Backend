import { fetchBinanceHistoricalKlines, fetchBinanceMarketPrice } from "../crypto/exchange/binanceService";
import { fetchKucoinHistoricalKlines, fetchKucoinMarketPrice } from "../crypto/exchange/kucoinService";
import { fetchCoinDCXHistoricalKlines, fetchCoinDCXMarketPrice } from "../crypto/exchange/coindcxService";

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
 */
function calculateOptimalLevels(
  lowerLimit: number,
  upperLimit: number,
  minimumInvestment: number,
  totalInvestment: number
): number {
  const priceRange = upperLimit - lowerLimit;
  const maxLevels = Math.floor(totalInvestment / minimumInvestment);
  
  // ✅ Calculate optimal levels based on price range
  const optimalSpacing = priceRange * 0.02; // 2% of range
  const optimalLevels = Math.ceil(priceRange / optimalSpacing);
  
  // ✅ Return smaller of optimal or maximum affordable
  return Math.min(Math.max(5, optimalLevels), maxLevels, 50);
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
  investment: number;
  minimumInvestment: number;
  userLowerLimit?: number;
  userUpperLimit?: number;
  userLevels?: number;
  userProfitPercentage?: number;
}) {
  const {
    exchange,
    symbol,
    dataSetDays,
    segment = "SPOT",
    investment,
    minimumInvestment,
    userLowerLimit,
    userUpperLimit,
    userLevels,
    userProfitPercentage,
  } = params;

  console.log("[SMART_GRID_AUTO_GEN] Starting calculation", {
    exchange,
    symbol,
    segment,
    dataSetDays,
    investment,
    minimumInvestment,
    hasUserOverrides: !!(userLowerLimit || userUpperLimit || userLevels),
  });

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
  const levels = userLevels || calculateOptimalLevels(
    lowerLimit,
    upperLimit,
    minimumInvestment,
    investment
  );

  console.log("[STEP_4] Levels calculated", {
    levels,
    userProvided: !!userLevels,
    investmentPerLevel: (investment / levels).toFixed(2),
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
  const perLevelInvestment = investment / levels;
  
  if (perLevelInvestment < minimumInvestment) {
    throw new Error(
      `Investment per level (${perLevelInvestment.toFixed(2)}) is below minimum (${minimumInvestment}). ` +
      `Reduce levels to ${Math.floor(investment / minimumInvestment)} or increase total investment.`
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
    
    // ✅ Investment breakdown
    investment,
    minimumInvestment,
    perLevelInvestment: parseFloat(perLevelInvestment.toFixed(2)),
    
    // ✅ Indicators (for transparency)
    indicators: {
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