// controllers/strategyController.ts
import { Response, Request } from "express";
import { createStrategy, getUserStrategies } from "../services/strategyService";
import {
  sendBadRequest,
  sendSuccess,
  sendServerError,
} from "../utils/response";
import { subscribeStrategyToMarketData } from "../sockets/marketDataRouter";

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
  } = req.body;

  if (
    !name ||
    !strategyType ||
    !exchange ||
    !segment ||
    !symbol ||
    !investmentPerRun ||
    !investmentCap ||
    !frequency
  ) {
    return sendBadRequest(res, "Missing required fields");
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
    });
    await subscribeStrategyToMarketData({
      assetType,
      exchange,
      segment,
      symbol,
      strategyId: strategy.id,
      userId,
    });
    return sendSuccess(res, "Strategy created", strategy);
  } catch (error: any) {
    console.error("[STRATEGY_CREATE]", error);
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
