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
    // ✅ NEW: Smart Grid validation
    const smartGridRequiredFields = {
      ...baseRequiredFields,
      lowerLimit,
      upperLimit,
      levels,
      profitPercentage,
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
      lowerLimit,
      upperLimit,
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