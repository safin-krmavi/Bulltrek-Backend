import { CryptoExchange, StocksExchange, Strategy } from "@prisma/client";
import prisma from "../../config/db.config";
import { tradeDispatcher } from "../../services/strategies/tradeDispatcher";
import { computeNextRunAt } from "../../utils/scheduler/computeNextRunAt";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { StockMarketDataManager } from "../../sockets/stocks/marketData/marketDataManager";
import { exitMonitor } from "../monitors/exitMonitor";
import { formatQuantity } from "../../utils/crypto/exchange/quantityFormatter";

export const timeEngine = {
  register(strategy: Strategy) {
    console.log(
      `[TIME_ENGINE_REGISTER] Strategy ${strategy.id} is active. Scheduling is handled by AWS.`,
    );
  },

  unregister(strategyId: string) {
    console.log(
      `[TIME_ENGINE_UNREGISTER] Strategy ${strategyId} removed from active monitoring.`,
    );
  },
};

export async function executeStrategy(strategy: Strategy) {
  const executionStart = Date.now();
  const config = strategy.config as any;
  
  console.log("[EXECUTE_STRATEGY_START]", {
    strategyId: strategy.id,
    symbol: strategy.symbol,
    scheduledTime: strategy.nextRunAt?.toISOString(),
    actualTime: new Date(executionStart).toISOString(),
    delayMs: strategy.nextRunAt 
      ? executionStart - strategy.nextRunAt.getTime() 
      : 0,
  });

  try {
    // ✅ Fetch price with timeout
    const pricePromise = strategy.assetType === "CRYPTO"
      ? MarketDataManager.fetchMarketPrice(
          strategy.exchange as CryptoExchange,
          strategy.segment as any,
          strategy.symbol
        )
      : StockMarketDataManager.fetchMarketPrice(
          strategy.exchange as StocksExchange,
          strategy.userId,
          strategy.symbol
        );

    const marketPrice = await Promise.race([
      pricePromise,
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("Price fetch timeout")), 5000)
      )
    ]);

    if (!marketPrice || marketPrice <= 0) {
      throw new Error(`Invalid market price: ${marketPrice}`);
    }

    const priceFetchTime = Date.now() - executionStart;
    console.log("[MARKET_PRICE_FETCHED]", {
      strategyId: strategy.id,
      price: marketPrice,
      fetchTimeMs: priceFetchTime,
    });

    // ✅ Calculate TP/SL
    const takeProfitPrice = config.exit?.bookProfit?.enabled
      ? marketPrice * (1 + config.exit.bookProfit.percentage / 100)
      : 0;

    const stopLossPrice = config.risk?.stopLoss?.enabled
      ? marketPrice * (1 - config.risk.stopLoss.percentage / 100)
      : 0;

    // ✅ Price trigger check
    if (config.entry?.priceTrigger?.enabled) {
      if (
        !(
          marketPrice >= config.entry.priceTrigger.startPrice &&
          marketPrice <= config.entry.priceTrigger.stopPrice
        )
      ) {
        console.log("[EXECUTE_STRATEGY_BLOCKED]", {
          strategyId: strategy.id,
          reason: "Price trigger not met",
          currentPrice: marketPrice,
          triggerRange: `${config.entry.priceTrigger.startPrice} - ${config.entry.priceTrigger.stopPrice}`,
        });
        return;
      }
    }

    // ✅ Capital check
    const perOrder = config.capital.perOrderAmount;
    const canAllocate = await exitMonitor.canAllocate(
      strategy.id,
      perOrder,
      config.capital.maxCapital
    );

    if (!canAllocate) {
      console.warn("[EXECUTE_STRATEGY_BLOCKED]", {
        strategyId: strategy.id,
        reason: "Capital cap reached",
      });
      return;
    }

    // ✅ Format quantity
    const qty = await formatQuantity({
      exchange: strategy.exchange,
      tradeType: strategy.segment,
      symbol: strategy.symbol,
      rawQty: perOrder / marketPrice,
    });

    // ✅ Dispatch trade
    const tradeIntent = {
      userId: strategy.userId,
      exchange: strategy.exchange,
      segment: strategy.assetType as "CRYPTO" | "STOCK",
      tradeType: strategy.segment as "SPOT" | "FUTURES",
      symbol: strategy.symbol,
      side: "BUY" as "BUY" | "SELL",
      quantity: qty,
      price: marketPrice,
      takeProfit: takeProfitPrice,
      stopLoss: stopLossPrice,
      orderType: "MARKET" as "MARKET" | "LIMIT",
      strategyId: strategy.id,
    };

    await tradeDispatcher.dispatch(tradeIntent);

    // ✅ Track position
    await exitMonitor.trackPosition(strategy.id, {
      tradeId: `${strategy.id}-${executionStart}`,
      userId: tradeIntent.userId,
      symbol: tradeIntent.symbol,
      side: "BUY",
      entryPrice: tradeIntent.price,
      quantity: tradeIntent.quantity,
      segment: tradeIntent.segment,
      exchange: tradeIntent.exchange,
      tradeType: tradeIntent.tradeType,
      takeProfit: tradeIntent.takeProfit,
      stopLoss: tradeIntent.stopLoss,
    });

    const totalTime = Date.now() - executionStart;
    console.log("[EXECUTE_STRATEGY_COMPLETE]", {
      strategyId: strategy.id,
      totalExecutionTimeMs: totalTime,
      breakdown: {
        priceFetch: priceFetchTime,
        tradeExecution: totalTime - priceFetchTime,
      }
    });

  } catch (error: any) {
    const totalTime = Date.now() - executionStart;
    console.error("[EXECUTE_STRATEGY_ERROR]", {
      strategyId: strategy.id,
      error: error.message,
      totalTimeMs: totalTime,
    });
    throw error;
  }
}
