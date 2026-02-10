import { Strategy } from "@prisma/client";
import { UTCState, UTCDecision, UTCConfig } from "../../../types/strategies/utc.types.js";
import { calculateUTBot, calculateSTC } from "../../../utils/strategies/indicators.js";
import { Candle } from "../../../utils/strategies/historicalDataFetcher.js";

/**
 * Evaluate UTC Strategy
 * 
 * Combines UT Bot and STC indicators to generate trading signals:
 * - BUY: UT Bot Buy signal AND STC rising AND STC > 50
 * - SELL: UT Bot Sell signal OR take-profit/stop-loss triggered
 * 
 * @param strategy - Strategy database record
 * @param state - Current UTC strategy state
 * @param currentPrice - Current market price
 * @param historicalCandles - Recent candle data for indicator calculation
 * @returns UTCDecision with action and reason
 */
export function evaluateUTC(
    strategy: Strategy,
    state: UTCState,
    currentPrice: number,
    historicalCandles: Candle[]
): UTCDecision {
    const config = strategy.config as unknown as UTCConfig;

    console.log("[UTC_EVALUATE] Starting evaluation", {
        strategyId: strategy.id,
        currentPrice,
        candlesCount: historicalCandles.length,
        currentPosition: state.currentPosition,
    });

    // ========================================
    // STEP 1: CHECK FOR SELL CONDITIONS FIRST
    // ========================================

    // Check if we have an open position
    if (state.currentPosition === "LONG" && state.positionQty > 0) {
        // Check take-profit
        if (config.exit?.bookProfit?.enabled && state.avgEntryPrice) {
            const takeProfitPrice = state.avgEntryPrice * (1 + config.exit.bookProfit.percentage / 100);
            if (currentPrice >= takeProfitPrice) {
                console.log("[UTC_EVALUATE] Take-profit triggered", {
                    entryPrice: state.avgEntryPrice,
                    currentPrice,
                    takeProfitPrice,
                });
                return {
                    action: "SELL",
                    reason: "Take-profit target reached",
                    price: currentPrice,
                    quantity: state.positionQty,
                };
            }
        }

        // Check stop-loss
        if (config.risk?.stopLoss?.enabled && state.avgEntryPrice) {
            const stopLossPrice = state.avgEntryPrice * (1 - config.risk.stopLoss.percentage / 100);
            if (currentPrice <= stopLossPrice) {
                console.log("[UTC_EVALUATE] Stop-loss triggered", {
                    entryPrice: state.avgEntryPrice,
                    currentPrice,
                    stopLossPrice,
                });
                return {
                    action: "SELL",
                    reason: "Stop-loss triggered",
                    price: currentPrice,
                    quantity: state.positionQty,
                };
            }
        }

        // Check UT Bot Sell signal
        if (historicalCandles.length >= config.sellAtrPeriod + 10) {
            const utBotSellResults = calculateUTBot(
                historicalCandles,
                config.sellKeySensitivity,
                config.sellAtrPeriod
            );

            const latestSellSignal = utBotSellResults[utBotSellResults.length - 1];

            if (latestSellSignal && latestSellSignal.sellSignal) {
                console.log("[UTC_EVALUATE] UT Bot Sell signal triggered", {
                    trailingStop: latestSellSignal.trailingStop,
                    currentPrice,
                });
                return {
                    action: "SELL",
                    reason: "UT Bot Sell signal",
                    price: currentPrice,
                    quantity: state.positionQty,
                };
            }
        }
    }

    // ========================================
    // STEP 2: CHECK FOR BUY CONDITIONS
    // ========================================

    // Only buy if we don't have a position
    if (state.currentPosition === "NONE" || state.positionQty === 0) {
        // Check capital limits
        const nextCapital = state.investedCapital + config.capital.perOrderAmount;
        if (nextCapital > config.capital.maxCapital) {
            console.log("[UTC_EVALUATE] Capital limit reached", {
                investedCapital: state.investedCapital,
                maxCapital: config.capital.maxCapital,
            });
            return {
                action: "HOLD",
                reason: "Capital limit reached",
            };
        }

        // Check price trigger (optional)
        if (config.entry?.priceTrigger?.enabled) {
            if (currentPrice > config.entry.priceTrigger.startPrice) {
                return {
                    action: "HOLD",
                    reason: "Price above trigger start price",
                };
            }
            if (currentPrice < config.entry.priceTrigger.stopPrice) {
                return {
                    action: "HOLD",
                    reason: "Price below trigger stop price",
                };
            }
        }

        // Ensure we have enough historical data
        const minCandlesNeeded = Math.max(
            config.buyAtrPeriod + 10,
            config.stcLength * 2 + 50
        );

        if (historicalCandles.length < minCandlesNeeded) {
            console.log("[UTC_EVALUATE] Insufficient historical data", {
                available: historicalCandles.length,
                needed: minCandlesNeeded,
            });
            return {
                action: "HOLD",
                reason: "Insufficient historical data for indicators",
            };
        }

        // Calculate UT Bot Buy signal
        const utBotBuyResults = calculateUTBot(
            historicalCandles,
            config.buyKeySensitivity,
            config.buyAtrPeriod
        );

        const latestBuySignal = utBotBuyResults[utBotBuyResults.length - 1];

        if (!latestBuySignal || !latestBuySignal.buySignal) {
            return {
                action: "HOLD",
                reason: "No UT Bot Buy signal",
            };
        }

        console.log("[UTC_EVALUATE] UT Bot Buy signal detected", {
            trailingStop: latestBuySignal.trailingStop,
            currentPrice,
        });

        // Calculate STC indicator
        const stcValues = calculateSTC(
            historicalCandles,
            config.stcLength,
            config.stcFastLength,
            config.stcSlowLength || 50
        );

        const currentSTC = stcValues[stcValues.length - 1];
        const previousSTC = stcValues[stcValues.length - 2];

        console.log("[UTC_EVALUATE] STC values", {
            currentSTC,
            previousSTC,
            isRising: currentSTC > previousSTC,
            isAbove50: currentSTC > 50,
        });

        // Check STC conditions:
        // 1. STC is rising (current > previous)
        // 2. STC is above 50 (bullish momentum)
        if (currentSTC > previousSTC && currentSTC > 50) {
            console.log("[UTC_EVALUATE] All BUY conditions met", {
                utBotBuy: true,
                stcRising: true,
                stcAbove50: true,
            });

            return {
                action: "BUY",
                reason: "UT Bot Buy + STC bullish momentum confirmed",
                price: currentPrice,
                quantity: config.capital.perOrderAmount / currentPrice,
            };
        }

        // UT Bot signal present but STC not confirming
        return {
            action: "HOLD",
            reason: `UT Bot Buy signal present but STC not confirming (STC: ${currentSTC.toFixed(2)}, Rising: ${currentSTC > previousSTC})`,
        };
    }

    // Default: hold
    return {
        action: "HOLD",
        reason: "No conditions met",
    };
}
