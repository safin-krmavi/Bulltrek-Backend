import { Request, Response } from "express";
import fs from "fs/promises";
import { DATA_DIR } from "../../../constants/crypto";
import { STOCKS_FILE_PATH } from "../../../constants/stocks";
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
import { fetchAndStoreZerodhaInstruments } from "../../../services/stocks/exchange/zerodhaService";
import { fetchAndStoreKotakSymbols } from "../../../services/stocks/exchange/kotakService";

export const fetchStocksSymbolPairsController = async (
  req: Request,
  res: Response
) => {
  //read the file from data/symbol_pairs.json
  try {
    const data = await fs.readFile(STOCKS_FILE_PATH, "utf-8");
    const parsedData = JSON.parse(data);
    return sendSuccess(res, "Symbol pairs fetched successfully", parsedData);
  } catch (error) {
    return sendServerError(res, "Failed to read symbol pairs data");
  }
};

export const updateStockSymbolPairsController = async (
  _: Request,
  res: Response
) => {
  try {
    // 1. Fetch instruments in parallel
    const [zerodhaData, kotakData] = await Promise.all([
      fetchAndStoreZerodhaInstruments(),
      fetchAndStoreKotakSymbols(),
    ]);

    // 2. Format Zerodha instruments
    const zerodhaFormatted = Object.entries(zerodhaData).map(
      ([instrumentToken, tradingSymbol]) => ({
        instrumentToken: Number(instrumentToken),
        tradingSymbol,
        exchange: "NSE",
      })
    );

    // 3. Format Kotak instruments
    const kotakFormatted = Object.values(kotakData);

    // 4. Final payload
    const formattedData = [
      {
        type: "STOCKS",
        data: [
          {
            exchange: "ZERODHA",
            data: zerodhaFormatted,
          },
          {
            exchange: "KOTAK",
            data: kotakFormatted,
          },
        ],
      },
    ];

    // 5. Persist to file
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      STOCKS_FILE_PATH,
      JSON.stringify(formattedData, null, 2),
      "utf-8"
    );

    return sendSuccess(
      res,
      "Stock symbol pairs updated successfully",
      formattedData
    );
  } catch (error: any) {
    switch (error.code) {
      case "BAD_REQUEST":
        return sendBadRequest(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Failed to update stock symbol pairs"
        );
    }
  }
};

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
