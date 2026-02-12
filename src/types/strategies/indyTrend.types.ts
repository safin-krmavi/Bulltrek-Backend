import { Strategy } from "@prisma/client";

/**
 * INDY TREND Strategy Configuration
 * Stored in Strategy.config JSON field
 */
export interface IndyTrendConfig {
    // Trading Parameters
    timeFrame: string;              // Default: "5m"
    leverage?: number;              // 1-20x (mandatory for Crypto Futures only)

    // Price Limits (optional guardrails)
    lowerLimit?: number;            // No LONG if price < this
    upperLimit?: number;            // No SHORT if price > this

    // Price Triggers (optional activation/stop thresholds)
    priceTriggerStart?: number;     // Entry allowed only if price >= this (LONG) or <= this (SHORT)
    priceTriggerStop?: number;      // Hard stop - close position & pause strategy

    // Capital Management
    investment: number;             // Per trade allocation
    investmentCap: number;          // Max total exposure across positions

    // Stop Loss (Fixed %)
    stopLossByPercent: number;      // e.g., 2 = 2%

    // Take Profit (Risk-Reward Based)
    riskRewardRatio: number;        // Default: 2 (1:2 risk-reward)

    // Indicator Parameters
    supertrend: {
        factor: number;               // Default: 3.0
        atrLength: number;            // Default: 10
    };

    rsi: {
        length: number;               // Default: 21
        upperBand: number;            // Default: 70 (overbought threshold)
        lowerBand: number;            // Default: 30 (oversold threshold)
    };

    adx: {
        smoothing: number;            // Default: 21
        diLength: number;             // Default: 21
        threshold: number;            // Default: 25 (minimum ADX for entry)
    };

    // Mode
    mode: "LONG" | "SHORT" | "NEUTRAL";  // LONG only, SHORT only, or both

    // Advanced Options
    partialExit?: {
        enabled: boolean;
        firstTargetPercent: number;   // % of position to exit at 1R (e.g., 50)
        secondTargetPercent: number;  // % of position to exit at 2R (e.g., 50)
    };

    trailingStop?: {
        enabled: boolean;
        useSupertrendFlip: boolean;   // Exit on Supertrend flip
    };
}

/**
 * INDY TREND Strategy State
 * Tracks the runtime state of an INDY TREND strategy instance
 */
export interface IndyTrendState {
    investedCapital: number;
    positionQty: number;
    avgEntryPrice: number | null;
    lastExecutionAt: number | null;
    status: "ACTIVE" | "PAUSED" | "STOPPED";

    // Position tracking
    currentPosition: "LONG" | "SHORT" | "NONE";

    // Cooldown (1 candle = 5 minutes after exit)
    cooldownUntil: number | null;   // Timestamp in ms

    // Safety - consecutive loss tracking
    consecutiveLosses: number;
    pausedUntil: number | null;     // Auto-pause after 3 losses (1 hour)

    // Partial exit tracking
    partialExitExecuted?: boolean;
    remainingQty?: number;

    // Pending order flag
    pendingOrder?: boolean;
}

/**
 * INDY TREND Strategy Decision
 * Result of evaluating INDY TREND strategy conditions
 */
export interface IndyTrendDecision {
    action: "BUY" | "SELL" | "HOLD";
    reason: string;
    price?: number;
    quantity?: number;
    stopLoss?: number;
    takeProfit?: number;
}
