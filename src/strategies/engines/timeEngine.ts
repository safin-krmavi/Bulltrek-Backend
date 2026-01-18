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
  const config = strategy.config as any;
  console.log("[EXECUTE_STRATEGY_START]", {
    strategyId: strategy.id,
    assetType: strategy.assetType,
    exchange: strategy.exchange,
    symbol: strategy.symbol,
  });

  const marketPrice =
    strategy.assetType === "CRYPTO"
      ? await MarketDataManager.fetchMarketPrice(
          strategy.exchange as CryptoExchange,
          (strategy as any).segment,
          strategy.symbol,
        )
      : await StockMarketDataManager.fetchMarketPrice(
          strategy.exchange as StocksExchange,
          strategy.userId,
          strategy.symbol,
        );

  if (!marketPrice || marketPrice <= 0) {
    console.warn("[MARKET_PRICE_INVALID]", {
      strategyId: strategy.id,
      price: marketPrice,
    });
    return;
  }
  console.log("[MARKET_PRICE_FETCHED]", {
    strategyId: strategy.id,
    price: marketPrice,
  });

  const takeProfitPrice = config.exit?.bookProfit?.enabled
    ? marketPrice * (1 + config.exit.bookProfit.percentage / 100)
    : 0;

  const stopLossPrice = config.risk?.stopLoss?.enabled
    ? marketPrice * (1 - config.risk.stopLoss.percentage / 100)
    : 0;

  if (config.entry?.priceTrigger?.enabled) {
    if (
      !(
        marketPrice >= config.entry.priceTrigger.startPrice &&
        marketPrice <= config.entry.priceTrigger.stopPrice
      )
    ) {
      console.log("[RUN_STRATEGY_ENTRY_BLOCKED]", strategy.id, marketPrice);
      return;
    }
  }

  const perOrder = config.capital.perOrderAmount;

  const canAllocate = await exitMonitor.canAllocate(
    strategy.id,
    perOrder,
    config.capital.maxCapital,
  );
  console.log("[CAPITAL_CHECK]", {
    strategyId: strategy.id,
    perOrder,
    maxCapital: config.capital.maxCapital,
    allowed: canAllocate,
  });

  if (!canAllocate) {
    console.warn("[CAPITAL_BLOCKED]", {
      strategyId: strategy.id,
    });
    return;
  }
  const qty = await formatQuantity({
    exchange: strategy.exchange,
    tradeType: strategy.segment,
    symbol: strategy.symbol,
    rawQty: perOrder / marketPrice,
  });

  const tradeIntent = {
    userId: strategy.userId,
    exchange: strategy.exchange,
    segment: (strategy as any).assetType as "CRYPTO" | "STOCK",
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
  console.log("[TRADE_DISPATCHED]", {
    strategyId: strategy.id,
  });

  await exitMonitor.trackPosition(strategy.id, {
    tradeId: tradeIntent.strategyId + "-" + Date.now(),
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
  console.log("[POSITION_TRACKING_STARTED]", {
    strategyId: strategy.id,
    symbol: tradeIntent.symbol,
  });
}
