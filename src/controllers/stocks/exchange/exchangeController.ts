import { Request, Response } from "express";
import {
  sendBadRequest,
  sendServerError,
  sendSuccess,
  sendUnauthorized,
} from "../../../utils/response";
import {
  getStockBalances,
  getStockLoginUrl,
  getStockPositions,
  handleStockAuthCallback,
  loginStockExchange,
  placeStockOrder,
  verifyStockCredentials,
} from "../../../services/stocks/exchange/exchangeService";
import { getStocksCredentials } from "../../../services/stocks/credentialsService";
import { StocksExchange } from "@prisma/client";

export const getStockLoginUrlController = async (req, res) => {
  const { exchange } = req.body;
  const userId = req.user.userId;

  if (!exchange) {
    return sendBadRequest(res, "exchange is required");
  }

  try {
    const data = getStockLoginUrl(exchange, userId);
    return sendSuccess(res, "Login URL generated", data);
  } catch (error: any) {
    if (error.code === "NOT_REQUIRED") {
      return sendBadRequest(res, error.message);
    }
    return sendServerError(res, error.message);
  }
};

export const zerodhaCallbackController = async (req, res) => {
  try {
    const data = handleStockAuthCallback(StocksExchange.ZERODHA, req);
    return sendSuccess(res, "Callback handled", data);
  } catch (error: any) {
    return sendBadRequest(res, error.message);
  }
};
export const angelOneCallbackController = async (req, res) => {
  try {
    const data = handleStockAuthCallback(StocksExchange.ANGELONE, req);
    return sendSuccess(res, "Callback handled", data);
  } catch (error: any) {
    return sendBadRequest(res, error.message);
  }
};

export const loginStockExchangeController = async (req, res) => {
  const { exchange, payload } = req.body;
  const userId = req.user.userId;

  if (!exchange || !payload) {
    return sendBadRequest(res, "exchange and payload are required");
  }

  try {
    await loginStockExchange(exchange, {
      userId,
      ...payload,
    });

    return sendSuccess(res, "Broker connected successfully");
  } catch (error: any) {
    if (error.code === "NOT_REQUIRED") {
      return sendBadRequest(res, error.message);
    }
    return sendServerError(res, error.message);
  }
};

export const verifyStockKeysController = async (
  req: Request,
  res: Response
) => {
  const { exchange, credentials } = req.body;

  if (!exchange || !credentials) {
    return sendBadRequest(res, "exchange and credentials are required");
  }

  try {
    await verifyStockCredentials(exchange, credentials);
    return sendSuccess(res, "Credentials verified successfully");
  } catch (error: any) {
    if (error.code === "AUTH_FAILED") {
      return sendUnauthorized(res, error.message);
    }

    return sendServerError(res, error.message);
  }
};

export const getStockBalancesController = async (req, res) => {
  const { exchange } = req.body;
  const userId = req.user.userId;

  if (!exchange) {
    return sendBadRequest(res, "exchange is required");
  }

  try {
    const rawCredentials = await getStocksCredentials(userId, exchange);

    const credentials = Array.isArray(rawCredentials)
      ? rawCredentials[0]
      : rawCredentials;

    if (!credentials) {
      throw {
        code: "BAD_REQUEST",
        message: "Credentials not found",
      };
    }

    const balances = await getStockBalances(exchange, credentials);

    return sendSuccess(res, "Balances fetched", balances);
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};

export const placeStockOrderController = async (req: any, res: Response) => {
  const { exchange, order } = req.body;
  const userId = req.user.userId;

  if (!exchange || !order) {
    return sendBadRequest(res, "exchange and order are required");
  }

  try {
    const rawCredentials = await getStocksCredentials(userId, exchange);
    const credentials = Array.isArray(rawCredentials)
      ? rawCredentials[0]
      : rawCredentials;

    if (!credentials) {
      return sendBadRequest(res, "Credentials not found");
    }

    const result = await placeStockOrder(
      exchange,
      {
        apiKey: credentials.apiKey,
        accessToken: credentials.accessToken,
      },
      order
    );

    return sendSuccess(res, "Order placed successfully", result);
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};

export const getStockPositionsController = async (req: any, res: Response) => {
  const { exchange } = req.body;
  const userId = req.user.userId;

  if (!exchange) {
    return sendBadRequest(res, "exchange is required");
  }

  try {
    const rawCredentials = await getStocksCredentials(userId, exchange);
    const credentials = Array.isArray(rawCredentials)
      ? rawCredentials[0]
      : rawCredentials;

    if (!credentials) {
      return sendBadRequest(res, "Credentials not found");
    }

    const positions = await getStockPositions(exchange, {
      apiKey: credentials.apiKey,
      accessToken: credentials.accessToken,
    });

    return sendSuccess(res, "Positions fetched", positions);
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};
