// sockets/crypto/marketData/candleBootstrap.ts
import { CryptoTradeType } from "@prisma/client";
import { fetchBinanceHistoricalKlines } from "../../../services/crypto/exchange/binanceService";
import { CandleBuffer, Candle } from "./candleBuffer";

/**
 * Bootstrap candle buffer with historical data
 */
export async function bootstrapCandles(params: {
    exchange: string;
    segment: CryptoTradeType;
    symbol: string;
    timeframe: string;
    limit?: number;
}): Promise<void> {
    const { exchange, segment, symbol, timeframe, limit = 500 } = params;

    console.log("[CANDLE_BOOTSTRAP] Starting", {
        exchange,
        segment,
        symbol,
        timeframe,
        limit,
    });

    try {
        if (exchange === "BINANCE") {
            // Fetch historical klines from Binance REST API
            const klines = await fetchBinanceHistoricalKlines(
                symbol,
                timeframe,
                limit,
                segment
            );

            console.log("[CANDLE_BOOTSTRAP] Fetched klines", {
                exchange,
                segment,
                symbol,
                count: klines.length,
            });

            // Convert to Candle format
            const candles: Candle[] = klines.map((kline: any) => ({
                time: kline[0], // Open time
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
            }));

            // Initialize buffer
            CandleBuffer.initialize(exchange, segment, symbol, candles);

            console.log("[CANDLE_BOOTSTRAP] Complete", {
                exchange,
                segment,
                symbol,
                candleCount: candles.length,
                oldestCandle: new Date(candles[0]?.time || 0).toISOString(),
                newestCandle: new Date(candles[candles.length - 1]?.time || 0).toISOString(),
            });
        } else {
            throw new Error(`Exchange ${exchange} not supported for candle bootstrap`);
        }
    } catch (error: any) {
        console.error("[CANDLE_BOOTSTRAP] Error", {
            exchange,
            segment,
            symbol,
            timeframe,
            error: error.message,
            stack: error.stack,
        });
        throw error;
    }
}
