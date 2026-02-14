import { Strategy } from "@prisma/client";
import { LESIState, LESIDecision, LESIConfig } from "../../../types/strategies/lesi.types.js";
import {
    calculateEMA,
    calculateLaguerreRSI,
    calculateLorentzianClassification,
    LorentzianClassificationResult
} from "../../../utils/strategies/indicators.js";
import { Candle } from "../../../utils/strategies/historicalDataFetcher.js";

/**
 * Helper function to extract price values based on source type
 */
function extractPriceSource(
    candles: Candle[],
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4"
): number[] {
    switch (source) {
        case "close":
            return candles.map(c => c.close);
        case "open":
            return candles.map(c => c.open);
        case "high":
            return candles.map(c => c.high);
        case "low":
            return candles.map(c => c.low);
        case "hl2":
            return candles.map(c => (c.high + c.low) / 2);
        case "hlc3":
            return candles.map(c => (c.high + c.low + c.close) / 3);
        case "ohlc4":
            return candles.map(c => (c.open + c.high + c.low + c.close) / 4);
        default:
            return candles.map(c => c.close);
    }
}

/**
 * Evaluate LESI Strategy
 * Combines Lorentzian Classification, EMA, and Laguerre RSI for trading signals
 * 
 * Strategy Logic:
 * - All ENABLED indicators must confirm the signal direction
 * - Modular design: users can enable/disable any combination of indicators
 * - Supports LONG positions (SHORT can be added later if needed)
 */
export function evaluateLESI(
    strategy: Strategy,
    state: LESIState,
    currentPrice: number,
    historicalCandles: Candle[]
): LESIDecision {
    const config = strategy.config as unknown as LESIConfig;

    console.log("[LESI_EVALUATE] Starting evaluation", {
        strategyId: strategy.id,
        currentPrice,
        candlesCount: historicalCandles.length,
        currentPosition: state.currentPosition,
    });

    // ========================================
    // STEP 1: SAFETY CHECKS
    // ========================================

    // Check if strategy is stopped or paused
    if (state.status !== "ACTIVE") {
        return {
            action: "HOLD",
            reason: `Strategy is ${state.status}`,
        };
    }

    // Check pending order flag
    if (state.pendingOrder) {
        return {
            action: "HOLD",
            reason: "Pending order in progress",
        };
    }

    // ========================================
    // STEP 2: PRICE TRIGGER STOP (CIRCUIT BREAKER)
    // ========================================

    if (config.priceTriggerStop && state.currentPosition !== "NONE") {
        if (currentPrice <= config.priceTriggerStop) {
            console.log("[LESI_EVALUATE] Price Trigger Stop hit - emergency exit", {
                currentPrice,
                triggerStop: config.priceTriggerStop,
            });

            return {
                action: "SELL",
                reason: "Price Trigger Stop hit - emergency exit",
                price: currentPrice,
                quantity: state.positionQty,
            };
        }
    }

    // ========================================
    // STEP 3: EXIT CONDITIONS (IF POSITION OPEN)
    // ========================================

    if (state.currentPosition === "LONG" && state.positionQty > 0 && state.avgEntryPrice) {
        return evaluateExitConditions(config, state, currentPrice, historicalCandles);
    }

    // ========================================
    // STEP 4: ENTRY CONDITIONS (IF NO POSITION)
    // ========================================

    if (state.currentPosition === "NONE") {
        return evaluateEntryConditions(config, state, currentPrice, historicalCandles);
    }

    return {
        action: "HOLD",
        reason: "No conditions met",
    };
}

/**
 * Evaluate Exit Conditions for Open Position
 */
function evaluateExitConditions(
    config: LESIConfig,
    state: LESIState,
    currentPrice: number,
    historicalCandles: Candle[]
): LESIDecision {
    const entryPrice = state.avgEntryPrice!;

    // Calculate Stop Loss price
    const stopLossPrice = entryPrice * (1 - config.stopLossByPercent / 100);

    console.log("[LESI_EXIT] Checking exit conditions", {
        entryPrice,
        currentPrice,
        stopLossPrice,
    });

    // Priority 1: Stop Loss
    if (currentPrice <= stopLossPrice) {
        console.log("[LESI_EXIT] Stop Loss triggered");
        return {
            action: "SELL",
            reason: "Stop Loss triggered",
            price: currentPrice,
            quantity: state.positionQty,
        };
    }

    // Priority 2: Opposite Signal Confirmation
    // Check if all enabled indicators flip to bearish
    const oppositeSignal = checkOppositeSignal(config, historicalCandles);
    if (oppositeSignal) {
        console.log("[LESI_EXIT] Opposite signal confirmed - all indicators bearish");
        return {
            action: "SELL",
            reason: "Opposite signal confirmation - indicators turned bearish",
            price: currentPrice,
            quantity: state.positionQty,
        };
    }

    return {
        action: "HOLD",
        reason: "No exit conditions met",
    };
}

/**
 * Evaluate Entry Conditions for New Position
 */
function evaluateEntryConditions(
    config: LESIConfig,
    state: LESIState,
    currentPrice: number,
    historicalCandles: Candle[]
): LESIDecision {
    // Check Investment CAP
    if (state.investedCapital >= config.investmentCap) {
        return {
            action: "HOLD",
            reason: "Investment CAP reached",
        };
    }

    // Check Price Limits
    if (config.lowerLimit && currentPrice < config.lowerLimit) {
        return {
            action: "HOLD",
            reason: "Price below Lower Limit",
        };
    }

    if (config.upperLimit && currentPrice > config.upperLimit) {
        return {
            action: "HOLD",
            reason: "Price above Upper Limit",
        };
    }

    // Check Price Trigger Start
    if (config.priceTriggerStart && currentPrice < config.priceTriggerStart) {
        return {
            action: "HOLD",
            reason: "Price below Trigger Start threshold",
        };
    }

    // Ensure sufficient historical data
    const minCandles = Math.max(
        config.indicators.ema.enabled ? config.indicators.ema.length + 10 : 0,
        config.indicators.lc.enabled ? 50 : 0,
        30 // Minimum for LaRSI
    );

    if (historicalCandles.length < minCandles) {
        console.log("[LESI_ENTRY] Insufficient historical data", {
            available: historicalCandles.length,
            needed: minCandles,
        });
        return {
            action: "HOLD",
            reason: "Insufficient historical data for indicators",
        };
    }

    // ========================================
    // CALCULATE ALL ENABLED INDICATORS
    // ========================================

    const conditions: Record<string, boolean> = {};
    const indicators: string[] = [];

    // Indicator 1: Lorentzian Classification (LC)
    if (config.indicators.lc.enabled) {
        const lcResults = calculateLorentzianClassification(
            historicalCandles,
            config.indicators.lc.source
        );
        const latestLC = lcResults[lcResults.length - 1];

        conditions.lcBullish = latestLC.signal === "BULLISH";
        indicators.push(`LC: ${latestLC.signal} (confidence: ${latestLC.confidence.toFixed(2)})`);

        // Update state
        state.lcSignal = latestLC.signal;

        console.log("[LESI_ENTRY] LC Signal", {
            signal: latestLC.signal,
            confidence: latestLC.confidence,
            prediction: latestLC.prediction,
        });
    }

    // Indicator 2: EMA (Trend Filter)
    if (config.indicators.ema.enabled) {
        const priceSource = extractPriceSource(historicalCandles, config.indicators.ema.source);
        const emaValues = calculateEMA(priceSource, config.indicators.ema.length);
        const latestEMA = emaValues[emaValues.length - 1];

        conditions.priceAboveEMA = currentPrice > latestEMA;
        indicators.push(`EMA(${config.indicators.ema.length}): ${latestEMA.toFixed(2)}, Price ${currentPrice > latestEMA ? 'above' : 'below'}`);

        // Update state
        state.emaValue = latestEMA;

        console.log("[LESI_ENTRY] EMA Filter", {
            ema: latestEMA,
            currentPrice,
            priceAboveEMA: conditions.priceAboveEMA,
        });
    }

    // Indicator 3: Laguerre RSI (Momentum)
    if (config.indicators.laRSI.enabled) {
        const laRSIValues = calculateLaguerreRSI(
            historicalCandles,
            config.indicators.laRSI.alpha
        );
        const latestLaRSI = laRSIValues[laRSIValues.length - 1];
        const previousLaRSI = laRSIValues[laRSIValues.length - 2];

        // Bullish momentum: LaRSI rising from oversold region (< 30) or in bullish zone (> 50)
        conditions.laRSIBullish =
            (latestLaRSI > previousLaRSI && latestLaRSI > 30) ||
            (latestLaRSI > 50 && latestLaRSI < 80);

        indicators.push(`LaRSI: ${latestLaRSI.toFixed(2)} (${latestLaRSI > previousLaRSI ? 'rising' : 'falling'})`);

        // Update state
        state.laRSIValue = latestLaRSI;

        console.log("[LESI_ENTRY] LaRSI Momentum", {
            laRSI: latestLaRSI,
            previousLaRSI,
            rising: latestLaRSI > previousLaRSI,
            bullish: conditions.laRSIBullish,
        });
    }

    // ========================================
    // MULTI-INDICATOR CONFIRMATION
    // ========================================

    // All enabled indicators must confirm bullish signal
    const allConditionsMet = Object.values(conditions).every(c => c === true);

    console.log("[LESI_ENTRY] Indicator Conditions", {
        conditions,
        allConditionsMet,
        indicators,
    });

    if (!allConditionsMet) {
        return {
            action: "HOLD",
            reason: `Not all indicators confirm: ${indicators.join(", ")}`,
        };
    }

    // ========================================
    // GENERATE BUY SIGNAL
    // ========================================

    const quantity = config.leverage
        ? (config.investment * config.leverage) / currentPrice
        : config.investment / currentPrice;

    const stopLossPrice = currentPrice * (1 - config.stopLossByPercent / 100);

    console.log("[LESI_ENTRY] BUY signal confirmed", {
        indicators,
        quantity,
        stopLossPrice,
    });

    return {
        action: "BUY",
        reason: `All indicators confirm LONG: ${indicators.join(", ")}`,
        price: currentPrice,
        quantity,
        stopLoss: stopLossPrice,
    };
}

/**
 * Check if opposite signal is present (for exit)
 * Returns true if all enabled indicators show bearish signal
 */
function checkOppositeSignal(
    config: LESIConfig,
    historicalCandles: Candle[]
): boolean {
    const bearishConditions: boolean[] = [];

    // Check LC if enabled
    if (config.indicators.lc.enabled) {
        const lcResults = calculateLorentzianClassification(
            historicalCandles,
            config.indicators.lc.source
        );
        const latestLC = lcResults[lcResults.length - 1];
        bearishConditions.push(latestLC.signal === "BEARISH");
    }

    // Check EMA if enabled
    if (config.indicators.ema.enabled) {
        const priceSource = extractPriceSource(historicalCandles, config.indicators.ema.source);
        const emaValues = calculateEMA(priceSource, config.indicators.ema.length);
        const latestEMA = emaValues[emaValues.length - 1];
        const currentPrice = historicalCandles[historicalCandles.length - 1].close;

        bearishConditions.push(currentPrice < latestEMA);
    }

    // Check LaRSI if enabled
    if (config.indicators.laRSI.enabled) {
        const laRSIValues = calculateLaguerreRSI(
            historicalCandles,
            config.indicators.laRSI.alpha
        );
        const latestLaRSI = laRSIValues[laRSIValues.length - 1];
        const previousLaRSI = laRSIValues[laRSIValues.length - 2];

        // Bearish: LaRSI falling from overbought or in bearish zone
        const isBearish =
            (latestLaRSI < previousLaRSI && latestLaRSI < 70) ||
            (latestLaRSI < 50 && latestLaRSI > 20);

        bearishConditions.push(isBearish);
    }

    // All enabled indicators must be bearish
    return bearishConditions.length > 0 && bearishConditions.every(c => c === true);
}
