import { Strategy } from "@prisma/client";
import { IndyTrendState, IndyTrendDecision, IndyTrendConfig } from "../../../types/strategies/indyTrend.types.js";
import { calculateSupertrend, calculateRSI, calculateADX } from "../../../utils/strategies/indicators.js";
import { Candle } from "../../../utils/strategies/historicalDataFetcher.js";

/**
 * Evaluate INDY TREND Strategy
 * Combines Supertrend, RSI, and ADX indicators for trend-following trades
 */
export function evaluateIndyTrend(
    strategy: Strategy,
    state: IndyTrendState,
    currentPrice: number,
    historicalCandles: Candle[]
): IndyTrendDecision {
    const config = strategy.config as unknown as IndyTrendConfig;

    console.log("[INDY_TREND_EVALUATE] Starting evaluation", {
        strategyId: strategy.id,
        currentPrice,
        candlesCount: historicalCandles.length,
        currentPosition: state.currentPosition,
    });

    // ========================================
    // STEP 1: SAFETY CHECKS
    // ========================================

    // Check if paused due to consecutive losses
    if (state.pausedUntil && Date.now() < state.pausedUntil) {
        return {
            action: "HOLD",
            reason: "Strategy paused due to 3 consecutive losses (1 hour cooldown)",
        };
    }

    // Check cooldown period (1 candle = 5 minutes)
    if (state.cooldownUntil && Date.now() < state.cooldownUntil) {
        return {
            action: "HOLD",
            reason: "In cooldown period (1 candle after exit)",
        };
    }

    // ========================================
    // STEP 2: PRICE TRIGGER STOP (HARD FAIL-SAFE)
    // ========================================

    if (config.priceTriggerStop && state.currentPosition !== "NONE") {
        const shouldStop =
            (state.currentPosition === "LONG" && currentPrice <= config.priceTriggerStop) ||
            (state.currentPosition === "SHORT" && currentPrice >= config.priceTriggerStop);

        if (shouldStop) {
            console.log("[INDY_TREND_EVALUATE] Price Trigger Stop hit - emergency exit", {
                position: state.currentPosition,
                currentPrice,
                triggerStop: config.priceTriggerStop,
            });

            return {
                action: "SELL",
                reason: "Price Trigger Stop hit - emergency exit and pause",
                price: currentPrice,
                quantity: state.positionQty,
            };
        }
    }

    // ========================================
    // STEP 3: EXIT CONDITIONS (IF POSITION OPEN)
    // ========================================

    if (state.currentPosition !== "NONE" && state.positionQty > 0 && state.avgEntryPrice) {
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
    config: IndyTrendConfig,
    state: IndyTrendState,
    currentPrice: number,
    historicalCandles: Candle[]
): IndyTrendDecision {
    const entryPrice = state.avgEntryPrice!;
    const isLong = state.currentPosition === "LONG";

    // Calculate Stop Loss and Take Profit prices
    const stopLossPrice = isLong
        ? entryPrice * (1 - config.stopLossByPercent / 100)
        : entryPrice * (1 + config.stopLossByPercent / 100);

    const risk = Math.abs(entryPrice - stopLossPrice);
    const takeProfitPrice = isLong
        ? entryPrice + risk * config.riskRewardRatio
        : entryPrice - risk * config.riskRewardRatio;

    console.log("[INDY_TREND_EXIT] Checking exit conditions", {
        position: state.currentPosition,
        entryPrice,
        currentPrice,
        stopLossPrice,
        takeProfitPrice,
    });

    // Priority 1: Stop Loss
    if (
        (isLong && currentPrice <= stopLossPrice) ||
        (!isLong && currentPrice >= stopLossPrice)
    ) {
        console.log("[INDY_TREND_EXIT] Stop Loss triggered");
        return {
            action: "SELL",
            reason: "Stop Loss triggered",
            price: currentPrice,
            quantity: state.positionQty,
        };
    }

    // Priority 2: Take Profit
    if (
        (isLong && currentPrice >= takeProfitPrice) ||
        (!isLong && currentPrice <= takeProfitPrice)
    ) {
        console.log("[INDY_TREND_EXIT] Take Profit triggered");
        return {
            action: "SELL",
            reason: "Take Profit target reached",
            price: currentPrice,
            quantity: state.positionQty,
        };
    }

    // Priority 3: Supertrend Flip (if trailing stop enabled)
    if (config.trailingStop?.enabled && config.trailingStop.useSupertrendFlip) {
        const minCandles = Math.max(config.supertrend.atrLength + 10, 50);

        if (historicalCandles.length >= minCandles) {
            const supertrendResults = calculateSupertrend(
                historicalCandles,
                config.supertrend.factor,
                config.supertrend.atrLength
            );

            const latestSupertrend = supertrendResults[supertrendResults.length - 1];

            // Exit if Supertrend flips against our position
            if (
                (isLong && latestSupertrend.trend === "BEARISH") ||
                (!isLong && latestSupertrend.trend === "BULLISH")
            ) {
                console.log("[INDY_TREND_EXIT] Supertrend flip detected");
                return {
                    action: "SELL",
                    reason: "Supertrend flip - trailing stop exit",
                    price: currentPrice,
                    quantity: state.positionQty,
                };
            }
        }
    }

    // Priority 4: Opposite Signal Confirmation
    const oppositeSignal = checkOppositeSignal(config, state, historicalCandles);
    if (oppositeSignal) {
        console.log("[INDY_TREND_EXIT] Opposite signal confirmed");
        return {
            action: "SELL",
            reason: "Opposite signal confirmation",
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
    config: IndyTrendConfig,
    state: IndyTrendState,
    currentPrice: number,
    historicalCandles: Candle[]
): IndyTrendDecision {
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
            reason: "Price below Lower Limit - no LONG trades allowed",
        };
    }

    if (config.upperLimit && currentPrice > config.upperLimit) {
        return {
            action: "HOLD",
            reason: "Price above Upper Limit - no SHORT trades allowed",
        };
    }

    // Check Price Trigger Start
    if (config.priceTriggerStart) {
        // For LONG: price must be >= trigger start
        // For SHORT: price must be <= trigger start
        // For NEUTRAL: check based on potential direction
        if (currentPrice < config.priceTriggerStart) {
            return {
                action: "HOLD",
                reason: "Price below Trigger Start threshold",
            };
        }
    }

    // Ensure sufficient historical data
    const minCandles = Math.max(
        config.supertrend.atrLength + 10,
        config.rsi.length + 10,
        config.adx.diLength + config.adx.smoothing + 10
    );

    if (historicalCandles.length < minCandles) {
        console.log("[INDY_TREND_ENTRY] Insufficient historical data", {
            available: historicalCandles.length,
            needed: minCandles,
        });
        return {
            action: "HOLD",
            reason: "Insufficient historical data for indicators",
        };
    }

    // Calculate all indicators
    const supertrendResults = calculateSupertrend(
        historicalCandles,
        config.supertrend.factor,
        config.supertrend.atrLength
    );

    const rsiValues = calculateRSI(historicalCandles, config.rsi.length);

    const adxResults = calculateADX(
        historicalCandles,
        config.adx.diLength,
        config.adx.smoothing
    );

    const latestSupertrend = supertrendResults[supertrendResults.length - 1];
    const latestRSI = rsiValues[rsiValues.length - 1];
    const latestADX = adxResults[adxResults.length - 1];

    console.log("[INDY_TREND_ENTRY] Indicator values", {
        supertrend: latestSupertrend.trend,
        rsi: latestRSI.toFixed(2),
        adx: latestADX.adx.toFixed(2),
        plusDI: latestADX.plusDI.toFixed(2),
        minusDI: latestADX.minusDI.toFixed(2),
    });

    // Check ADX threshold (minimum 25 for trending market)
    if (latestADX.adx < config.adx.threshold) {
        return {
            action: "HOLD",
            reason: `ADX below threshold (${latestADX.adx.toFixed(2)} < ${config.adx.threshold}) - market not trending`,
        };
    }

    // ========================================
    // LONG ENTRY CONDITIONS
    // ========================================

    const canGoLong = config.mode === "LONG" || config.mode === "NEUTRAL";

    if (canGoLong) {
        const longConditions = {
            supertrendBullish: latestSupertrend.trend === "BULLISH",
            rsiInRange: latestRSI > 55 && latestRSI < 70,
            adxStrong: latestADX.adx >= config.adx.threshold,
            plusDIGreater: latestADX.plusDI > latestADX.minusDI,
        };

        const allLongConditionsMet = Object.values(longConditions).every((c) => c);

        console.log("[INDY_TREND_ENTRY] LONG conditions", longConditions);

        if (allLongConditionsMet) {
            const quantity = config.leverage
                ? (config.investment * config.leverage) / currentPrice
                : config.investment / currentPrice;

            const stopLossPrice = currentPrice * (1 - config.stopLossByPercent / 100);
            const risk = currentPrice - stopLossPrice;
            const takeProfitPrice = currentPrice + risk * config.riskRewardRatio;

            console.log("[INDY_TREND_ENTRY] LONG entry signal confirmed");

            return {
                action: "BUY",
                reason: "LONG: Supertrend Bullish + RSI 55-70 + ADX ≥25 + +DI > -DI",
                price: currentPrice,
                quantity,
                stopLoss: stopLossPrice,
                takeProfit: takeProfitPrice,
            };
        }
    }

    // ========================================
    // SHORT ENTRY CONDITIONS
    // ========================================

    const canGoShort = config.mode === "SHORT" || config.mode === "NEUTRAL";

    if (canGoShort) {
        const shortConditions = {
            supertrendBearish: latestSupertrend.trend === "BEARISH",
            rsiInRange: latestRSI < 45 && latestRSI > 30,
            adxStrong: latestADX.adx >= config.adx.threshold,
            minusDIGreater: latestADX.minusDI > latestADX.plusDI,
        };

        const allShortConditionsMet = Object.values(shortConditions).every((c) => c);

        console.log("[INDY_TREND_ENTRY] SHORT conditions", shortConditions);

        if (allShortConditionsMet) {
            const quantity = config.leverage
                ? (config.investment * config.leverage) / currentPrice
                : config.investment / currentPrice;

            const stopLossPrice = currentPrice * (1 + config.stopLossByPercent / 100);
            const risk = stopLossPrice - currentPrice;
            const takeProfitPrice = currentPrice - risk * config.riskRewardRatio;

            console.log("[INDY_TREND_ENTRY] SHORT entry signal confirmed");

            return {
                action: "SELL", // For SHORT position
                reason: "SHORT: Supertrend Bearish + RSI 30-45 + ADX ≥25 + -DI > +DI",
                price: currentPrice,
                quantity,
                stopLoss: stopLossPrice,
                takeProfit: takeProfitPrice,
            };
        }
    }

    return {
        action: "HOLD",
        reason: "Entry conditions not met",
    };
}

/**
 * Check if opposite signal is present (for exit)
 */
function checkOppositeSignal(
    config: IndyTrendConfig,
    state: IndyTrendState,
    historicalCandles: Candle[]
): boolean {
    const minCandles = Math.max(
        config.supertrend.atrLength + 10,
        config.rsi.length + 10,
        config.adx.diLength + config.adx.smoothing + 10
    );

    if (historicalCandles.length < minCandles) {
        return false;
    }

    const supertrendResults = calculateSupertrend(
        historicalCandles,
        config.supertrend.factor,
        config.supertrend.atrLength
    );

    const rsiValues = calculateRSI(historicalCandles, config.rsi.length);
    const adxResults = calculateADX(
        historicalCandles,
        config.adx.diLength,
        config.adx.smoothing
    );

    const latestSupertrend = supertrendResults[supertrendResults.length - 1];
    const latestRSI = rsiValues[rsiValues.length - 1];
    const latestADX = adxResults[adxResults.length - 1];

    const isLong = state.currentPosition === "LONG";

    if (isLong) {
        // Check for SHORT signal while in LONG position
        return (
            latestSupertrend.trend === "BEARISH" &&
            latestRSI < 45 &&
            latestRSI > 30 &&
            latestADX.adx >= config.adx.threshold &&
            latestADX.minusDI > latestADX.plusDI
        );
    } else {
        // Check for LONG signal while in SHORT position
        return (
            latestSupertrend.trend === "BULLISH" &&
            latestRSI > 55 &&
            latestRSI < 70 &&
            latestADX.adx >= config.adx.threshold &&
            latestADX.plusDI > latestADX.minusDI
        );
    }
}
