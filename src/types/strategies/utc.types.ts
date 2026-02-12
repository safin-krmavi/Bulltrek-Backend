import { Strategy } from "@prisma/client";

/**
 * UTC Strategy State
 * Tracks the runtime state of a UTC strategy instance
 */
export interface UTCState {
    investedCapital: number;
    positionQty: number;
    avgEntryPrice: number | null;
    lastExecutionAt: number | null;
    status: "ACTIVE" | "PAUSED" | "STOPPED";
    pendingOrder?: boolean;

    // UTC-specific state
    utBotBuyTrailingStop: number;
    utBotSellTrailingStop: number;
    stcValue: number;
    previousSTCValue: number;
    currentPosition: "LONG" | "SHORT" | "NONE";
}

/**
 * UTC Strategy Decision
 * Result of evaluating UTC strategy conditions
 */
export interface UTCDecision {
    action: "BUY" | "SELL" | "HOLD";
    reason: string;
    price?: number;
    quantity?: number;
}

/**
 * UTC Strategy Configuration
 * Stored in Strategy.config JSON field
 */
export interface UTCConfig {
    // Trading Parameters
    timeFrame: string;              // e.g., "2m", "5m", "15m"
    leverage?: number;              // Optional leverage (for FUTURES)
    upperLimit: number;             // Upper price limit
    lowerLimit: number;             // Lower price limit

    // Capital Management
    capital: {
        perOrderAmount: number;
        maxCapital: number;
    };

    // UT Bot Indicator Parameters
    buyKeySensitivity: number;      // UT Bot buy sensitivity (default: 1)
    buyAtrPeriod: number;           // ATR period for buy signals (default: 10)
    sellKeySensitivity: number;     // UT Bot sell sensitivity (default: 1)
    sellAtrPeriod: number;          // ATR period for sell signals (default: 10)

    // STC Indicator Parameters
    stcLength: number;              // STC length (default: 12)
    stcFastLength: number;          // STC fast length (default: 26)
    stcSlowLength: number;          // STC slow length (default: 50)

    // Exit Strategy
    exit?: {
        bookProfit?: {
            enabled: boolean;
            percentage: number;     // Take profit percentage
        };
    };

    // Risk Management (optional)
    risk?: {
        stopLoss?: {
            enabled: boolean;
            percentage: number;
        };
    };

    // Price Triggers (optional)
    entry?: {
        priceTrigger?: {
            enabled: boolean;
            startPrice: number;
            stopPrice: number;
        };
    };
}
