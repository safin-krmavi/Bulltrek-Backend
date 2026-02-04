// controllers/strategyController.ts
import { Response, Request } from "express";
import {
  changeStrategyStatus,
  createStrategy,
  deleteStrategy,
  getStrategyById,
  getUserStrategies,
  updateStrategy,
} from "../services/strategyService";
import {
  sendBadRequest,
  sendSuccess,
  sendServerError,
} from "../utils/response";
import {
  subscribeStrategyToMarketData,
  unsubscribeStrategyFromMarketData,
} from "../sockets/marketDataRouter";
import { strategyRuntimeRegistry } from "../services/strategies/strategyRuntimeRegistry";
import { CryptoExchange, StocksExchange } from "@prisma/client";
import { registerStrategy, unregisterStrategy } from "../strategies/dispatcher";
import { scheduleStrategy } from "../utils/scheduleStrategy";
import { deleteSchedule } from "../utils/awsScheduler";
import { calculateBollingerBands } from "../utils/strategies/gridCalculations";
import { MarketDataManager } from "../sockets/crypto/marketData/marketDataManager";

/**
 * Calculate Smart Grid limits based on Bollinger Bands
 */
export const calculateSmartGridLimits = async (req: Request, res: Response) => {
  try {
    const { exchange, segment, symbol, period = 20, stdDev = 2 } = req.body;

    // Validate input
    if (!exchange || !segment || !symbol) {
      return sendBadRequest(res, "exchange, segment, and symbol are required");
    }

    // console.log("[CALCULATE_SMART_GRID_LIMITS] Request", {
    //   exchange,
    //   segment,
    //   symbol,
    //   period,
    //   stdDev,
    // });

    // Fetch historical prices
    // For Binance, we can use the market data manager to get recent prices
    let prices: number[] = [];

    if (exchange === "BINANCE") {
      // Try to get from cache first
      const lastPrice = MarketDataManager.getLastPrice(exchange, segment, symbol);
      
      if (!lastPrice) {
        // Fetch fresh data
        const currentPrice = await MarketDataManager.fetchMarketPrice(
          exchange,
          segment,
          symbol
        );
        
        if (!currentPrice) {
          return sendServerError(res, "Unable to fetch current market price");
        }

        // For now, use current price to calculate approximate range
        // In production, you'd fetch historical candles from Binance API
        prices = Array(period).fill(currentPrice);
        
        console.warn("[CALCULATE_SMART_GRID_LIMITS] Using current price only", {
          symbol,
          currentPrice,
          note: "Historical data not available, using approximation",
        });
      } else {
        // Use last known price
        prices = Array(period).fill(lastPrice);
      }
    } else {
      return sendBadRequest(res, `Exchange ${exchange} not supported yet`);
    }

    // Calculate Bollinger Bands
    const bands = calculateBollingerBands(prices, period, stdDev);

    // console.log("[CALCULATE_SMART_GRID_LIMITS] Calculated bands", {
    //   symbol,
    //   upper: bands.upper,
    //   middle: bands.middle,
    //   lower: bands.lower,
    // });

    // Return the limits
    return sendSuccess(res, "Smart Grid limits calculated successfully", {
      upperLimit: parseFloat(bands.upper.toFixed(6)),
      lowerLimit: parseFloat(bands.lower.toFixed(6)),
      middlePrice: parseFloat(bands.middle.toFixed(6)),
      currentPrice: prices[prices.length - 1],
      period,
      stdDev,
      calculatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[CALCULATE_SMART_GRID_LIMITS] Error", {
      error: error.message,
      stack: error.stack,
    });
    return sendServerError(res, error.message);
  }
};

/**
 * Calculate Smart Grid limits with historical data (enhanced version)
 */
export const calculateSmartGridLimitsEnhanced = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      exchange,
      segment,
      symbol,
      period = 20,
      stdDev = 2,
      dataSetDays = 30,
    } = req.body;

    // Validate input
    if (!exchange || !segment || !symbol) {
      return sendBadRequest(res, "exchange, segment, and symbol are required");
    }

    console.log("[CALCULATE_SMART_GRID_LIMITS_ENHANCED] Request", {
      exchange,
      segment,
      symbol,
      period,
      stdDev,
      dataSetDays,
    });

    // TODO: Fetch historical candles from Binance API
    // For now, return error message
    return sendServerError(
      res,
      "Historical data fetching not implemented yet. Use /calculate-smart-grid-limits for basic calculation."
    );

    /*
    // Future implementation:
    const historicalData = await fetchHistoricalCandles(
      exchange,
      segment,
      symbol,
      dataSetDays
    );
    
    const closePrices = historicalData.map(candle => candle.close);
    const bands = calculateBollingerBands(closePrices, period, stdDev);
    
    return sendSuccess(res, "Smart Grid limits calculated", {
      upperLimit: bands.upper,
      lowerLimit: bands.lower,
      middlePrice: bands.middle,
      currentPrice: closePrices[closePrices.length - 1],
      dataPoints: closePrices.length,
      period,
      stdDev,
      calculatedAt: new Date().toISOString(),
    });
    */
  } catch (error: any) {
    console.error("[CALCULATE_SMART_GRID_LIMITS_ENHANCED] Error", {
      error: error.message,
      stack: error.stack,
    });
    return sendServerError(res, error.message);
  }
};
export const createStrategyController = async (req: any, res: Response) => {
  const userId = req.user.userId;
  
  const {
    name,
    strategyType,
    assetType,
    exchange,
    segment,
    symbol,
    investmentPerRun,
    investmentCap,
    frequency,
    takeProfitPct,
    stopLossPct,
    priceStart,
    priceStop,
    time,
    hourInterval,
    daysOfWeek,
    datesOfMonth,
    executionMode,
    // Human Grid
    lowerLimit,
    upperLimit,
    entryInterval,
    bookProfitBy,
    leverage,
    direction,
    // Smart Grid
    levels,
    profitPercentage,
    dataSetDays,
    gridMode,
    recalculationInterval,
  } = req.body;

  const baseRequiredFields = {
    name,
    strategyType,
    exchange,
    segment,
    symbol,
    investmentPerRun,
    investmentCap,
    executionMode,
  };

  if (strategyType === "HUMAN_GRID") {
    const gridRequiredFields = {
      ...baseRequiredFields,
      lowerLimit,
      upperLimit,
      entryInterval,
      bookProfitBy,
    };

    const missingFields = Object.entries(gridRequiredFields)
      .filter(([_, value]) => value === undefined || value === null || value === "")
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return sendBadRequest(
        res,
        `Missing required fields: ${missingFields.join(", ")}`
      );
    }

    if (segment === "FUTURES") {
      if (!leverage || !direction) {
        return sendBadRequest(
          res,
          "Leverage and Direction are required for Futures trading"
        );
      }
    }
  } else if (strategyType === "SMART_GRID") {
    // ✅ UPDATED: lowerLimit/upperLimit now optional
    const smartGridRequiredFields = {
      ...baseRequiredFields,
      levels,
      profitPercentage,
      dataSetDays, // ✅ Required for auto-generation
    };

    const missingFields = Object.entries(smartGridRequiredFields)
      .filter(([_, value]) => value === undefined || value === null || value === "")
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return sendBadRequest(
        res,
        `Missing required fields: ${missingFields.join(", ")}`
      );
    }

    // ✅ NEW: Validate dataSetDays range
    if (dataSetDays < 7 || dataSetDays > 365) {
      return sendBadRequest(
        res,
        "dataSetDays must be between 7 and 365"
      );
    }

    if (segment === "FUTURES") {
      if (!leverage || !direction) {
        return sendBadRequest(
          res,
          "Leverage and Direction are required for Futures trading"
        );
      }
    }
  } else {
    const requiredFields = {
      ...baseRequiredFields,
      frequency,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => value === undefined || value === null || value === "")
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return sendBadRequest(
        res,
        `Missing required fields: ${missingFields.join(", ")}`
      );
    }
  }

  try {
    const strategy = await createStrategy({
      userId,
      name,
      strategyType,
      assetType,
      exchange,
      segment,
      symbol,
      investmentPerRun,
      investmentCap,
      frequency,
      takeProfitPct,
      stopLossPct,
      priceStart,
      priceStop,
      time,
      hourInterval,
      daysOfWeek,
      datesOfMonth,
      executionMode,
      lowerLimit, // ✅ Optional now
      upperLimit, // ✅ Optional now
      entryInterval,
      bookProfitBy,
      leverage,
      direction,
      levels,
      profitPercentage,
      dataSetDays,
      gridMode,
      recalculationInterval,
    });

    if (
      strategy.executionMode === "LIVE" ||
      strategy.executionMode === "PUBLISHED"
    ) {
      await registerStrategy(strategy.id);

      // Only schedule TIME-BASED strategies
      if (strategy.type !== "HUMAN_GRID" && strategy.type !== "SMART_GRID" && strategy.nextRunAt) {
        const lambdaArn = process.env.RUN_STRATEGY_LAMBDA_ARN!;
        const schedule = await scheduleStrategy({ strategy, lambdaArn });
        console.log("[STRATEGY_SCHEDULED]", schedule);
      } else {
        console.log("[STRATEGY_SIGNAL_BASED_NO_SCHEDULE]", {
          strategyId: strategy.id,
          type: strategy.type,
        });
      }
    }

    if (strategy.executionMode === "BACKTEST") {
      console.log("[BACKTEST] Enqueue job for strategy:", strategy.id);
    }

    return sendSuccess(res, "Strategy created", strategy);
  } catch (error: any) {
    console.error("[CREATE_STRATEGY_ERROR]", error);
    return sendServerError(res, error.message);
  }
};

export const getStrategyByIdController = async (req: any, res: Response) => {
  try {
    const strategy = await getStrategyById(req.params.strategyId);
    return sendSuccess(res, "Strategy fetched", strategy);
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};

export const getUserStrategiesController = async (req: any, res: Response) => {
  const userId = req.user.userId;

  try {
    const strategies = await getUserStrategies(userId);
    return sendSuccess(res, "User strategies fetched successfully", strategies);
  } catch (error: any) {
    console.error("[STRATEGY_CONTROLLER] Failed to fetch strategies", error);
    return sendServerError(res, error.message || "Failed to fetch strategies");
  }
};

export const updateStrategyController = async (req: any, res: Response) => {
  const userId = req.user.userId;
  const { strategyId } = req.params;

  try {
    const oldStrategy = await getStrategyById(strategyId);

    const updated = await updateStrategy(strategyId, userId, req.body);

    // 1. Unsubscribe old
    await unsubscribeStrategyFromMarketData({
      assetType: oldStrategy.assetType as "CRYPTO" | "STOCK",
      exchange: oldStrategy.exchange as any,
      segment: oldStrategy.segment,
      symbol: oldStrategy.symbol,
      strategyId: oldStrategy.id,
      userId: oldStrategy.userId,
    });

    // 2. Reset runtime
    await unregisterStrategy(strategyId);

    // 3. Resubscribe new
    if (updated.status === "ACTIVE") {
      await registerStrategy(strategyId);

      const lambdaArn = process.env.RUN_STRATEGY_LAMBDA_ARN!;
      await scheduleStrategy({ strategy: updated, lambdaArn });
    }
    return sendSuccess(res, "Strategy updated", updated);
  } catch (error: any) {
    console.error("[STRATEGY_UPDATE]", error);
    return sendServerError(res, error.message);
  }
};

export const deleteStrategyController = async (req: any, res: Response) => {
  const userId = req.user.userId;
  const { strategyId } = req.params;

  try {
    const strategy = await getStrategyById(strategyId);

    await unsubscribeStrategyFromMarketData({
      assetType: strategy.assetType as "CRYPTO" | "STOCK",
      exchange: strategy.exchange as any,
      segment: strategy.segment,
      symbol: strategy.symbol,
      strategyId: strategy.id,
      userId: strategy.userId,
    });

    await unregisterStrategy(strategyId);

    await deleteStrategy(strategyId, userId);

    const scheduleName = `strategy-${strategy.id}`;
    await deleteSchedule(scheduleName);
    
    return sendSuccess(res, "Strategy deleted");
  } catch (error: any) {
    console.error("[STRATEGY_DELETE]", error);
    return sendServerError(res, error.message);
  }
};

export const updateStrategyStatusController = async (
  req: any,
  res: Response,
) => {
  const userId = req.user.userId;
  const { strategyId } = req.params;
  const { status } = req.body;

  if (!["ACTIVE", "PAUSED", "STOPPED"].includes(status)) {
    return sendBadRequest(res, "Invalid status");
  }

  try {
    const strategy = await getStrategyById(strategyId);

    // 1️⃣ Leaving ACTIVE → teardown
    if (strategy.status === "ACTIVE" && status !== "ACTIVE") {
      await unregisterStrategy(strategyId);
      await deleteSchedule(`strategy-${strategyId}`);
    }

    // 2️⃣ Persist status
    const updated = await changeStrategyStatus(strategyId, userId, status);
    
    // 3️⃣ Entering ACTIVE → setup
    if (updated.status === "ACTIVE") {
      await registerStrategy(strategyId);

      const lambdaArn = process.env.RUN_STRATEGY_LAMBDA_ARN!;
      await scheduleStrategy({ strategy: updated, lambdaArn });
    }

    return sendSuccess(res, "Strategy status updated", updated);
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};