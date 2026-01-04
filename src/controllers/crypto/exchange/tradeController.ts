import { Request, Response } from "express";
import {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendServerError,
} from "../../../utils/response";
import {
  CryptoExchange,
  CryptoTradeType,
  TradeSide,
  TradeStatus,
} from "@prisma/client";
import { getCryptoCredentials } from "../../../services/crypto/credentialsService";
import {
  cancelCryptoOrderService,
  createFuturesTrade,
  createSpotTrade,
  getCryptoOrdersService,
  getCryptoTradeHistoryService,
  getCryptoTradesService,
} from "../../../services/crypto/exchange/tradeService";
import { validateSpotTrade } from "../../../utils/crypto/exchange/spotTradeValidation";
import { validateFuturesTrade } from "../../../utils/crypto/exchange/futuresTradeValidation";
import { getActiveFuturesPositions } from "../../../services/crypto/exchange/tradeService";
// SPOT
export const createTradeController = async (req: any, res: Response) => {
  const { exchange, type, payload } = req.body;
  const userId = req.user.userId;

  if (!exchange || !type || !payload) {
    return sendBadRequest(res, "exchange, type and payload are required");
  }

  try {
    if (type === CryptoTradeType.SPOT) {
      validateSpotTrade(payload);
    }

    if (type === CryptoTradeType.FUTURES) {
      validateFuturesTrade(payload);
    }

    const credentials = await getCryptoCredentials(req.user.userId, exchange);

    if (!credentials) {
      return sendBadRequest(res, "No credentials found for this exchange");
    }

    const result =
      type === CryptoTradeType.SPOT
        ? await createSpotTrade(userId, exchange, credentials, payload)
        : await createFuturesTrade(userId, exchange, credentials, payload);
    return sendSuccess(res, "Trade placed successfully", result);
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message);
      case "BAD_REQUEST":
        return sendBadRequest(res, error.message);

      case "RATE_LIMITED":
        return sendBadRequest(res, error.message);
      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message);
      case "UNSUPPORTED_EXCHANGE":
        return sendBadRequest(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Futures trade creation failed "
        );
    }
  }
};

// FUTURES
export const getActiveFuturesPositionsController = async (
  req: any,
  res: Response
) => {
  const { exchange } = req.body;
  const userId = req.user.userId;

  if (!exchange) {
    return sendBadRequest(res, "exchange is required");
  }
  try {
    const positions = await getActiveFuturesPositions(userId, exchange);

    return sendSuccess(
      res,
      "Active futures positions fetched successfully",
      positions
    );
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message);
      case "BAD_REQUEST":
        return sendBadRequest(res, error.message);

      case "RATE_LIMITED":
        return sendBadRequest(res, error.message);
      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message);
      case "UNSUPPORTED_EXCHANGE":
        return sendBadRequest(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Failed to fetch active positions"
        );
    }
  }
};

export const getCryptoTradeHistoryController = async (
  req: any,
  res: Response
) => {
  try {
    const userId = req.user.userId;

    const {
      exchange,
      type,
      symbol,
      side,
      status,
      startDate,
      endDate,
      page,
      limit,
    } = req.query;

    if (exchange && !Object.values(CryptoExchange).includes(exchange)) {
      return sendBadRequest(res, "Invalid exchange");
    }

    if (type && !Object.values(CryptoTradeType).includes(type)) {
      return sendBadRequest(res, "Invalid trade type");
    }

    const result = await getCryptoTradeHistoryService({
      userId,
      exchange: exchange as CryptoExchange,
      type: type as CryptoTradeType,
      symbol: symbol as string,
      side: side as TradeSide,
      status: status as TradeStatus,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    return sendSuccess(res, "Trade history fetched successfully", result);
  } catch (error: any) {
    return sendServerError(
      res,
      error?.message || "Failed to fetch trade history"
    );
  }
};

export const cancelCryptoOrderController = async (req: any, res: Response) => {
  const { exchange, type, symbol, orderId } = req.body;

  if (!exchange || !type || !orderId) {
    return sendBadRequest(res, "exchange, type and orderId are required");
  }

  try {
    const data = await cancelCryptoOrderService({
      userId: req.user.id,
      exchange,
      type,
      symbol,
      orderId,
    });

    return sendSuccess(res, "Order cancelled successfully", data);
  } catch (error: any) {
    return sendServerError(res, error.message || "Failed to cancel order");
  }
};

export const getCryptoOrdersController = async (req: any, res: Response) => {
  const { exchange, type, symbol, orderId } = req.query as any;

  if (!exchange || !type) {
    return sendBadRequest(res, "exchange and type are required");
  }

  try {
    const data = await getCryptoOrdersService({
      userId: req.user.id,
      exchange,
      type,
      symbol,
      orderId,
    });

    return sendSuccess(res, "Orders fetched successfully", data);
  } catch (error: any) {
    return sendServerError(res, error.message || "Failed to fetch orders");
  }
};
export const getCryptoTradesController = async (req: any, res: Response) => {
  const { exchange, type, symbol } = req.query as any;

  if (!exchange || !type) {
    return sendBadRequest(res, "exchange and type are required");
  }

  try {
    const data = await getCryptoTradesService({
      userId: req.user.id,
      exchange,
      type,
      symbol,
    });

    return sendSuccess(res, "Trades fetched successfully", data);
  } catch (error: any) {
    return sendServerError(res, error.message || "Failed to fetch trades");
  }
};
