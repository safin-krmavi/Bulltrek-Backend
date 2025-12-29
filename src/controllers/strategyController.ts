// controllers/strategyController.ts
import { Response, Request } from "express";
import { changeStrategyStatus, createStrategy, deleteStrategy, getStrategyById, getUserStrategies, updateStrategy } from "../services/strategyService";
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
    const updated = await updateStrategy(strategyId, userId, req.body);
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
    await deleteStrategy(strategyId, userId);
    return sendSuccess(res, "Strategy deleted");
  } catch (error: any) {
    console.error("[STRATEGY_DELETE]", error);
    return sendServerError(res, error.message);
  }
};

export const updateStrategyStatusController = async (
  req: any,
  res: Response
) => {
  const userId = req.user.userId;
  const { strategyId } = req.params;
  const { status } = req.body;

  if (!["ACTIVE", "PAUSED", "STOPPED"].includes(status)) {
    return sendBadRequest(res, "Invalid status");
  }

  try {
    const updated = await changeStrategyStatus(
      strategyId,
      userId,
      status
    );
    return sendSuccess(res, "Strategy status updated", updated);
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};
