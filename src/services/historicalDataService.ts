import prisma from "../config/db.config";
import { fetchBinanceHistoricalKlines } from "./crypto/exchange/binanceService";
import { fetchKucoinHistoricalKlines } from "./crypto/exchange/kucoinService";
import { fetchCoinDCXHistoricalKlines } from "./crypto/exchange/coindcxService";

export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Fetch historical candles from exchange API
 */
async function fetchFromExchange(params: {
    exchange: string;
    segment: "SPOT" | "FUTURES";
    symbol: string;
    interval: string;
    days: number;
}): Promise<Candle[]> {
    const { exchange, segment, symbol, interval, days } = params;

    let rawCandles: any[] = [];

    console.log("[FETCH_FROM_EXCHANGE] Starting", {
        exchange,
        segment,
        symbol,
        interval,
        days,
    });

    // Fetch from appropriate exchange
    if (exchange.toUpperCase() === "BINANCE") {
        rawCandles = await fetchBinanceHistoricalKlines(
            symbol,
            interval,
            days,
            segment
        );
    } else if (exchange.toUpperCase() === "KUCOIN") {
        rawCandles = await fetchKucoinHistoricalKlines(
            symbol,
            interval,
            days,
            segment
        );
    } else if (exchange.toUpperCase() === "COINDCX") {
        rawCandles = await fetchCoinDCXHistoricalKlines(
            symbol,
            interval,
            days,
            segment
        );
    } else {
        throw new Error(`Unsupported exchange: ${exchange}`);
    }

    if (!rawCandles || rawCandles.length === 0) {
        throw new Error(
            `No historical data available for ${symbol} on ${exchange}`
        );
    }

    // Transform to Candle format
    // Format: [timestamp, open, high, low, close, volume, ...]
    const candles: Candle[] = rawCandles.map((c: any) => ({
        timestamp: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
    }));

    console.log("[FETCH_FROM_EXCHANGE] Success", {
        exchange,
        symbol,
        candlesCount: candles.length,
    });

    return candles;
}

/**
 * Get stored candles from database
 */
export async function getStoredCandles(params: {
    exchange: string;
    segment: string;
    symbol: string;
    interval: string;
    days: number;
}): Promise<Candle[]> {
    const { exchange, segment, symbol, interval, days } = params;

    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const candles = await prisma.historicalCandle.findMany({
        where: {
            exchange: exchange.toUpperCase(),
            segment: segment.toUpperCase(),
            symbol,
            interval,
            timestamp: {
                gte: startTime,
            },
        },
        orderBy: {
            timestamp: "asc",
        },
    });

    console.log("[GET_STORED_CANDLES]", {
        exchange,
        symbol,
        interval,
        days,
        found: candles.length,
    });

    return candles.map((c) => ({
        timestamp: Number(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
    }));
}

/**
 * Fetch and store historical data with caching
 */
export async function fetchAndStoreHistoricalData(params: {
    exchange: string;
    segment: "SPOT" | "FUTURES";
    symbol: string;
    interval: string;
    days: number;
    forceRefresh?: boolean;
}): Promise<Candle[]> {
    const { exchange, segment, symbol, interval, days, forceRefresh } = params;

    console.log("[FETCH_AND_STORE] Request", {
        exchange,
        segment,
        symbol,
        interval,
        days,
        forceRefresh,
    });

    // 1. Check if fresh data exists (< 24 hours old)
    if (!forceRefresh) {
        const existingData = await getStoredCandles({
            exchange,
            segment,
            symbol,
            interval,
            days,
        });

        if (existingData.length >= days) {
            // Check freshness of latest candle
            const latestTimestamp = Math.max(
                ...existingData.map((c) => c.timestamp)
            );
            const ageHours = (Date.now() - latestTimestamp) / (1000 * 60 * 60);

            if (ageHours < 24) {
                console.log("[FETCH_AND_STORE] Using cached data", {
                    candlesCount: existingData.length,
                    ageHours: ageHours.toFixed(2),
                });
                return existingData;
            }
        }
    }

    // 2. Fetch from exchange
    console.log("[FETCH_AND_STORE] Fetching fresh data from exchange");
    const candles = await fetchFromExchange({
        exchange,
        segment,
        symbol,
        interval,
        days,
    });

    // 3. Store in database (upsert to handle duplicates)
    try {
        await prisma.historicalCandle.createMany({
            data: candles.map((c) => ({
                exchange: exchange.toUpperCase(),
                segment: segment.toUpperCase(),
                symbol,
                interval,
                timestamp: BigInt(c.timestamp),
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume,
            })),
            skipDuplicates: true,
        });

        console.log("[FETCH_AND_STORE] Stored in database", {
            candlesCount: candles.length,
        });
    } catch (error: any) {
        console.error("[FETCH_AND_STORE] Database error", error.message);
        // Continue even if storage fails - return fetched data
    }

    return candles;
}

/**
 * Delete old candles to manage database size
 */
export async function cleanupOldCandles(daysToKeep: number = 365) {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    const result = await prisma.historicalCandle.deleteMany({
        where: {
            timestamp: {
                lt: cutoffTime,
            },
        },
    });

    console.log("[CLEANUP_OLD_CANDLES]", {
        daysToKeep,
        deleted: result.count,
    });

    return result.count;
}
