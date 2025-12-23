// controllers/strategyController.ts
import { Response, Request } from "express";
import { createStrategy, getUserStrategies } from "../services/strategyService";
import {
  sendBadRequest,
  sendSuccess,
  sendServerError,
} from "../utils/response";
import { MarketDataManager } from "../sockets/crypto/marketData/marketDataManager";
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
    });
  await   MarketDataManager.subscribe(exchange, segment, symbol, strategy.id);
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
