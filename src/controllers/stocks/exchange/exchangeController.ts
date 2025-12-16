import { Request, Response } from "express";
import {
  sendBadRequest,
  sendServerError,
  sendSuccess,
  sendUnauthorized,
} from "../../../utils/response";
import {
  generateStockAccessToken,
  getStockBalances,
  getStockLoginUrl,
  handleStockAuthCallback,
} from "../../../services/stocks/exchange/exchangeService";
import { getStocksCredentials } from "../../../services/stocks/credentialsService";
import { StocksExchange } from "@prisma/client";

export const getStockLoginUrlController = async (
  req: Request,
  res: Response
) => {
  const { broker, credentials } = req.body as {
    broker: string;
    credentials: {
      apiKey: string;
    };
  };

  if (!broker || !credentials) {
    return sendBadRequest(res, "Broker and credentials are required");
  }

  if (!credentials.apiKey) {
    return sendBadRequest(res, "API key is required");
  }

  try {
    const data = await getStockLoginUrl(broker, credentials);

    return sendSuccess(res, "Login URL generated", data);
  } catch (error: any) {
    switch (error.code) {
      case "UNSUPPORTED_BROKER":
        return sendBadRequest(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Failed to generate login URL"
        );
    }
  }
};

export const zerodhaCallbackController = async (req: any, res: Response) => {
  try {
    const data = await handleStockAuthCallback(req); // generic service

    return sendSuccess(res, "Auth callback handled", data);
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_FAILED":
        return sendBadRequest(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Failed to handle auth callback"
        );
    }
  }
};

export const generateStockAccessTokenController = async (
  req: Request,
  res: Response
) => {
  const { broker, credentials } = req.body as {
    broker: string;
    credentials: {
      apiKey: string;
      apiSecret: string;
      requestToken: string;
    };
  };

  if (!broker || !credentials) {
    return sendBadRequest(res, "Broker and credentials are required");
  }

  const { apiKey, apiSecret, requestToken } = credentials;

  if (!apiKey || !apiSecret || !requestToken) {
    return sendBadRequest(
      res,
      "API key, secret and request token are required"
    );
  }

  try {
    const data = await generateStockAccessToken(broker, credentials);

    return sendSuccess(res, "Access token generated", data);
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message);
      case "UNSUPPORTED_BROKER":
        return sendBadRequest(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Failed to generate access token"
        );
    }
  }
};

export const getStockBalancesController = async (req: any, res: Response) => {
  const { broker } = req.body as {
    broker: StocksExchange;
  };

  if (!broker) {
    return sendBadRequest(res, "Broker is required");
  }

  try {
    const rawCredentials = await getStocksCredentials(req.user.userId, broker);

    const credentials = Array.isArray(rawCredentials)
      ? rawCredentials[0]
      : rawCredentials;

    if (!credentials) {
      throw {
        code: "BAD_REQUEST",
        message: "Credentials not found",
      };
    }

    const balances = await getStockBalances(broker, credentials);

    return sendSuccess(res, "Balances fetched successfully", balances);
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message || "Invalid credentials");
      case "UNSUPPORTED_BROKER":
        return sendBadRequest(res, error.message);
      case "BROKER_UNAVAILABLE":
        return sendServerError(res, error.message || "Broker unavailable");
      default:
        return sendServerError(
          res,
          error?.message || "Failed to fetch balances"
        );
    }
  }
};
