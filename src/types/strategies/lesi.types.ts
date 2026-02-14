import { Strategy } from "@prisma/client";

/**
 * LESI Strategy Configuration
 * Stored in Strategy.config JSON field
 * 
 * LESI = Lorentzian + EMA + LaRSI Integrated Strategy
 * A modular multi-indicator strategy for automated trading
 */
export interface LESIConfig {
    // Trading Parameters
    timeFrame: string;              // e.g., "5m", "15m", "30m", "1H", "2H", "4H"
    leverage?: number;              // 1-20x (mandatory for Crypto Futures only)

    // Capital Management
    investment: number;             // Per trade allocation
    investmentCap: number;          // Max total exposure across positions

    // Price Limits (optional guardrails)
    lowerLimit?: number;            // No trades if price < this
    upperLimit?: number;            // No trades if price > this

    // Price Triggers (optional activation/stop thresholds)
    priceTriggerStart?: number;     // Entry allowed only if price >= this
    priceTriggerStop?: number;      // Hard stop - close position & pause strategy

    // Stop Loss (Fixed %)
    stopLossByPercent: number;      // e.g., 2 = 2%

    // Indicator Configurations
    indicators: {
        // Lorentzian Classification (LC)
        lc: {
            enabled: boolean;
            source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";
        };

        // Exponential Moving Average (EMA)
        ema: {
            enabled: boolean;
            length: number;         // Default: 200 (long-term trend)
            source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";
        };

        // Laguerre RSI (LaRSI)
        laRSI: {
            enabled: boolean;
            alpha: number;          // Default: 0.2 (smooth momentum curve)
            source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";
        };
    };
}

/**
 * LESI Strategy State
 * Tracks the runtime state of a LESI strategy instance
 */
export interface LESIState {
    investedCapital: number;
    positionQty: number;
    avgEntryPrice: number | null;
    lastExecutionAt: number | null;
    status: "ACTIVE" | "PAUSED" | "STOPPED";
    pendingOrder?: boolean;

    // Position tracking
    currentPosition: "LONG" | "SHORT" | "NONE";

    // Indicator values (cached for monitoring)
    emaValue: number;
    laRSIValue: number;
    lcSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
}

/**
 * LESI Strategy Decision
 * Result of evaluating LESI strategy conditions
 */
export interface LESIDecision {
    action: "BUY" | "SELL" | "HOLD";
    reason: string;
    price?: number;
    quantity?: number;
    stopLoss?: number;
}

/**
 * Lorentzian Classification Result
 */
export interface LorentzianClassificationResult {
    signal: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: number;         // 0-1 confidence score
    prediction: number;         // Raw prediction value
}
