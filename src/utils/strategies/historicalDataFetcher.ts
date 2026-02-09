import { fetchBinanceHistoricalKlines } from "../../services/crypto/exchange/binanceService";
import { fetchKucoinHistoricalKlines } from "../../services/crypto/exchange/kucoinService";
import { fetchCoinDCXHistoricalKlines } from "../../services/crypto/exchange/coindcxService";

/**
 * Unified interface for fetching historical price data across all exchanges
 */
export async function fetchHistoricalPrices(params: {
  exchange: string;
  segment: string;
  symbol: string;
  interval: string;
  limit: number;
}): Promise<number[]> {
  const { exchange, segment, symbol, interval, limit } = params;

  console.log("[FETCH_HISTORICAL_PRICES] Request", {
    exchange,
    segment,
    symbol,
    interval,
    limit,
  });

  try {
    let candles: any[] = [];

    // ✅ Handle different exchanges
    switch (exchange.toUpperCase()) {
      case "BINANCE":
        candles = await fetchBinanceHistoricalKlines(symbol, interval, limit);
        break;

      case "KUCOIN":
        candles = await fetchKucoinHistoricalKlines(symbol, interval, limit);
        break;

      case "COINDCX":
        candles = await fetchCoinDCXHistoricalKlines(symbol, interval, limit);
        break;

      default:
        throw new Error(`Exchange ${exchange} not supported`);
    }

    if (!candles || candles.length === 0) {
      throw new Error(`No historical data available for ${symbol} on ${exchange}`);
    }

    // ✅ Extract close prices (universal format)
    // Binance: [timestamp, open, high, low, close, volume, ...]
    // KuCoin: similar format
    // CoinDCX: may need adjustment
    const closePrices = candles.map((candle: any) => {
      // Handle different response formats
      if (Array.isArray(candle)) {
        return parseFloat(candle[4]); // Index 4 is close price for most exchanges
      }

      // Handle object format (if exchange returns objects)
      if (candle.close) {
        return parseFloat(candle.close);
      }

      throw new Error(`Unsupported candle format from ${exchange}`);
    });

    console.log("[FETCH_HISTORICAL_PRICES] Success", {
      exchange,
      symbol,
      candlesCount: closePrices.length,
      firstPrice: closePrices[0],
      lastPrice: closePrices[closePrices.length - 1],
    });

    return closePrices;
  } catch (error: any) {
    console.error("[FETCH_HISTORICAL_PRICES] Error", {
      exchange,
      symbol,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Validate interval format for each exchange
 */
export function validateInterval(exchange: string, interval: string): boolean {
  const intervalFormats: Record<string, string[]> = {
    BINANCE: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'],
    KUCOIN: ['1min', '3min', '5min', '15min', '30min', '1hour', '2hour', '4hour', '6hour', '8hour', '12hour', '1day', '1week'],
    COINDCX: ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '1d', '1w', '1M'],
  };

  const validIntervals = intervalFormats[exchange.toUpperCase()];
  if (!validIntervals) {
    throw new Error(`Interval validation not configured for ${exchange}`);
  }

  return validIntervals.includes(interval);
}

/**
 * Convert interval to exchange-specific format
 */
export function normalizeInterval(exchange: string, interval: string): string {
  // Binance and CoinDCX use same format
  if (exchange.toUpperCase() === 'BINANCE' || exchange.toUpperCase() === 'COINDCX') {
    return interval;
  }

  // KuCoin uses different format
  if (exchange.toUpperCase() === 'KUCOIN') {
    const intervalMap: Record<string, string> = {
      '1m': '1min',
      '3m': '3min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '1hour',
      '2h': '2hour',
      '4h': '4hour',
      '6h': '6hour',
      '8h': '8hour',
      '12h': '12hour',
      '1d': '1day',
      '1w': '1week',
    };
    return intervalMap[interval] || interval;
  }

  return interval;
}