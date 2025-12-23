import { Request, Response } from "express";
import {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendServerError,
} from "../../../utils/response";
import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import { getCryptoCredentials } from "../../../services/crypto/credentialsService";
import {
  createFuturesTrade,
  createSpotTrade,
  getFuturesOrdersFromExchangeService,
  getSpotOrdersFromExchangeService,
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

export const getSpotOrdersFromExchange = async (req: any, res: Response) => {
  try {
    const { exchange, symbol, startTime, endTime, limit } = req.body;
    const userId = req.user.userId;

    if (!exchange) return sendBadRequest(res, "exchange is required");

    // Fetch user credentials from DB
    const rawCredentials = await getCryptoCredentials(userId, exchange);

    const credentials = Array.isArray(rawCredentials)
      ? rawCredentials[0]
      : rawCredentials;

    if (!credentials) {
      sendBadRequest(res, "Credentials not found");
    }

    // Fetch trades
    const trades = await getSpotOrdersFromExchangeService(
      exchange,
      credentials,
      symbol,
      startTime,
      endTime,
      limit
    );

    return res.status(200).json({ success: true, trades });
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message);
      case "BAD_REQUEST":
      case "UNSUPPORTED_EXCHANGE":
      case "RATE_LIMITED":
        return sendBadRequest(res, error.message);
      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Spot trade fetch failed"
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

export const getFuturesOrdersFromExchange = async (req: any, res: Response) => {
  try {
    const { exchange, symbol, startTime, endTime, limit } = req.body;
    const userId = req.user.userId;

    if (!exchange) return sendBadRequest(res, "exchange is required");

    // Fetch user credentials from DB
    const rawCredentials = await getCryptoCredentials(userId, exchange);

    const credentials = Array.isArray(rawCredentials)
      ? rawCredentials[0]
      : rawCredentials;

    if (!credentials) {
      sendBadRequest(res, "Credentials not found");
    }

    // Fetch trades
    const trades = await getFuturesOrdersFromExchangeService(
      exchange,
      credentials,
      symbol
    );

    return res.status(200).json({ success: true, trades });
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message);
      case "BAD_REQUEST":
      case "UNSUPPORTED_EXCHANGE":
      case "RATE_LIMITED":
        return sendBadRequest(res, error.message);
      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Spot trade fetch failed"
        );
    }
  }
};
