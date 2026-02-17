import { Response } from "express";
import {
    fetchAndStoreHistoricalData,
    getStoredCandles,
    cleanupOldCandles,
} from "../services/historicalDataService";
import {
    sendBadRequest,
    sendServerError,
    sendSuccess,
} from "../utils/response";

/**
 * Fetch and store historical candle data
 * POST /api/v1/historical-data/fetch
 */
export const fetchHistoricalDataController = async (
    req: any,
    res: Response
) => {
    const { exchange, segment, symbol, interval, days, forceRefresh } = req.body;

    try {
        // Validate required fields
        if (!exchange || !segment || !symbol || !interval || !days) {
            return sendBadRequest(
                res,
                "Missing required fields: exchange, segment, symbol, interval, days"
            );
        }

        // Validate segment
        if (!["SPOT", "FUTURES"].includes(segment)) {
            return sendBadRequest(res, "segment must be either SPOT or FUTURES");
        }

        // Validate days
        if (days < 1 || days > 365) {
            return sendBadRequest(res, "days must be between 1 and 365");
        }

        const candles = await fetchAndStoreHistoricalData({
            exchange,
            segment,
            symbol,
            interval,
            days,
            forceRefresh: forceRefresh || false,
        });

        return sendSuccess(res, "Historical data fetched and stored", {
            candlesCount: candles.length,
            candles,
        });
    } catch (error: any) {
        console.error("[FETCH_HISTORICAL_DATA_ERROR]", error);
        return sendServerError(res, error.message);
    }
};

/**
 * Get stored historical candle data
 * GET /api/v1/historical-data
 */
export const getHistoricalDataController = async (req: any, res: Response) => {
    const { exchange, segment, symbol, interval, days } = req.query;

    try {
        // Validate required fields
        if (!exchange || !segment || !symbol || !interval || !days) {
            return sendBadRequest(
                res,
                "Missing required query params: exchange, segment, symbol, interval, days"
            );
        }

        // Validate segment
        if (!["SPOT", "FUTURES"].includes(segment as string)) {
            return sendBadRequest(res, "segment must be either SPOT or FUTURES");
        }

        const daysNum = parseInt(days as string);
        if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
            return sendBadRequest(res, "days must be between 1 and 365");
        }

        const candles = await getStoredCandles({
            exchange: exchange as string,
            segment: segment as string,
            symbol: symbol as string,
            interval: interval as string,
            days: daysNum,
        });

        return sendSuccess(res, "Stored historical data retrieved", {
            candlesCount: candles.length,
            candles,
        });
    } catch (error: any) {
        console.error("[GET_HISTORICAL_DATA_ERROR]", error);
        return sendServerError(res, error.message);
    }
};

/**
 * Refresh historical data (force fetch from exchange)
 * POST /api/v1/historical-data/refresh
 */
export const refreshHistoricalDataController = async (
    req: any,
    res: Response
) => {
    const { exchange, segment, symbol, interval, days } = req.body;

    try {
        // Validate required fields
        if (!exchange || !segment || !symbol || !interval || !days) {
            return sendBadRequest(
                res,
                "Missing required fields: exchange, segment, symbol, interval, days"
            );
        }

        // Validate segment
        if (!["SPOT", "FUTURES"].includes(segment)) {
            return sendBadRequest(res, "segment must be either SPOT or FUTURES");
        }

        // Validate days
        if (days < 1 || days > 365) {
            return sendBadRequest(res, "days must be between 1 and 365");
        }

        const candles = await fetchAndStoreHistoricalData({
            exchange,
            segment,
            symbol,
            interval,
            days,
            forceRefresh: true, // Force refresh
        });

        return sendSuccess(res, "Historical data refreshed", {
            candlesCount: candles.length,
            candles,
        });
    } catch (error: any) {
        console.error("[REFRESH_HISTORICAL_DATA_ERROR]", error);
        return sendServerError(res, error.message);
    }
};

/**
 * Cleanup old historical data
 * DELETE /api/v1/historical-data/cleanup
 */
export const cleanupHistoricalDataController = async (
    req: any,
    res: Response
) => {
    const { daysToKeep = 365 } = req.body;

    try {
        const deletedCount = await cleanupOldCandles(daysToKeep);

        return sendSuccess(res, "Old historical data cleaned up", {
            deletedCount,
            daysToKeep,
        });
    } catch (error: any) {
        console.error("[CLEANUP_HISTORICAL_DATA_ERROR]", error);
        return sendServerError(res, error.message);
    }
};
