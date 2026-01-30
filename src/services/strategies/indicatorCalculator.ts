import { calculateATR, calculateBollingerBands } from "../../utils/strategies/gridCalculations";
import { fetchBinanceHistoricalKlines } from "../crypto/exchange/binanceService";

/**
 * Fetch historical OHLC data
 */
async function fetchHistoricalData(
  exchange: string,
  symbol: string,
  interval: string = "1d",
  days: number = 30
): Promise<{ high: number[]; low: number[]; close: number[] }> {
  const limit = days;
  const candles = await fetchBinanceHistoricalKlines(symbol, interval, limit);

  return {
    high: candles.map((c: any) => parseFloat(c[2])),
    low: candles.map((c: any) => parseFloat(c[3])),
    close: candles.map((c: any) => parseFloat(c[4])),
  };
}

/**
 * Auto-generate Smart Grid parameters using technical indicators
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

  // 1. Fetch historical data
  const { high, low, close } = await fetchHistoricalData(exchange, symbol, "1d", dataSetDays);

  // 2. Calculate Bollinger Bands
  const bollinger = calculateBollingerBands(close, 20, 2);

  // 3. Calculate ATR
  const atr = calculateATR(high, low, close, 14);

  // 4. Determine optimal levels based on volatility
  const priceRange = bollinger.upper - bollinger.lower;
  const suggestedLevels = Math.max(5, Math.min(50, Math.floor(priceRange / (atr * 2))));

  // 5. Allow user overrides
  const finalLowerLimit = userLowerLimit || bollinger.lower;
  const finalUpperLimit = userUpperLimit || bollinger.upper;
  const finalLevels = userLevels || suggestedLevels;

  return {
    lowerLimit: parseFloat(finalLowerLimit.toFixed(2)),
    upperLimit: parseFloat(finalUpperLimit.toFixed(2)),
    levels: finalLevels,
    indicators: {
      bollingerUpper: parseFloat(bollinger.upper.toFixed(2)),
      bollingerLower: parseFloat(bollinger.lower.toFixed(2)),
      atr: parseFloat(atr.toFixed(4)),
    },
    dataSetDays,
  };
}