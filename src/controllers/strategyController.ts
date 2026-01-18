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
  console.log(req.user);
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

    // schedule-related (optional per frequency)
    time, // "HH:mm"
    hourInterval, // number
    daysOfWeek, // number[]
    datesOfMonth, // number[]
    executionMode,
  } = req.body;
  const requiredFields = {
    name,
    strategyType,
    exchange,
    segment,
    symbol,
    investmentPerRun,
    investmentCap,
    frequency,
    executionMode,
  };

  const missingFields = Object.entries(requiredFields)
    .filter(
      ([_, value]) => value === undefined || value === null || value === "",
    )
    .map(([key]) => key);

  if (missingFields.length > 0) {
    console.error("Missing required fields:", missingFields);
    return sendBadRequest(
      res,
      `Missing required fields: ${missingFields.join(", ")}`,
    );
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
      // schedule inputs (already coming from controller)
      time,
      hourInterval,
      daysOfWeek,
      datesOfMonth,
      executionMode,
    });

    if (
      strategy.executionMode === "LIVE" ||
      strategy.executionMode === "PUBLISHED"
    ) {
      await registerStrategy(strategy.id);

      const lambdaArn = process.env.RUN_STRATEGY_LAMBDA_ARN!;
      const schedule = await scheduleStrategy({ strategy, lambdaArn });
      console.log("SCHEDULE", schedule);
    }

    if (strategy.executionMode === "BACKTEST") {
      // enqueue backtest job
    }

    return sendSuccess(res, "Strategy created", strategy);
  } catch (error: any) {
    console.error("[STRATEGY_CREATE]", error);
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
      // await subscribeStrategyToMarketData({
      //   assetType: updated.assetType as "CRYPTO" | "STOCK",
      //   exchange: updated.exchange as CryptoExchange | StocksExchange,
      //   segment: updated.segment,
      //   symbol: updated.symbol,
      //   strategyId: updated.id,
      //   userId,
      // });
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

    // strategyRuntimeRegistry.remove(strategyId);

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
