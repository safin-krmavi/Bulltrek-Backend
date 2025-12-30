import { Request, Response } from "express";
import {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendServerError,
} from "../../../utils/response";
import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import {
  fetchSymbolPairs,
  getExchangeBalances,
  refreshSymbolMeta,
  verifyExchangeCredentials,
} from "../../../services/crypto/exchange/exchangeService";
import { getCryptoCredentials } from "../../../services/crypto/credentialsService";
import { getBinanceUSDTData } from "../../../services/crypto/exchange/binanceService";
import { getKucoinAllData } from "../../../services/crypto/exchange/kucoinService";
import { getCoinDCXAllData } from "../../../services/crypto/exchange/coindcxService";
import fs from "fs/promises";
import { FILE_PATH, DATA_DIR } from "../../../constants/crypto";
import { getSymbolPrecision } from "../../../utils/crypto/exchange/precisionResolver";
// import { promises as fs } from "fs";

export const fetchSymbolPairsController = async (
  req: Request,
  res: Response
) => {
  //read the file from data/symbol_pairs.json
  try {
    const data = await fs.readFile(FILE_PATH, "utf-8");
    const parsedData = JSON.parse(data);
    return sendSuccess(res, "Symbol pairs fetched successfully", parsedData);
  } catch (error) {
    return sendServerError(res, "Failed to read symbol pairs data");
  }
};

export const updateSymbolPairsController = async (
  _: Request,
  res: Response
) => {
  try {
    const [binanceData, kucoinData, coinDCXData] = await Promise.all([
      getBinanceUSDTData(),
      getKucoinAllData(),
      getCoinDCXAllData(),
    ]);

    const formattedData = [
      {
        type: "CRYPTO_SPOT",
        data: [
          {
            exchange: "BINANCE",
            data: binanceData.spotSymbols,
          },

          {
            exchange: "KUCOIN",
            data: kucoinData.spotSymbols,
          },
          {
            exchange: "COINDCX",
            data: coinDCXData.spotSymbols,
          },
        ],
      },
      {
        type: "CRYPTO_FUTURES",
        data: [
          {
            exchange: "BINANCE",
            data: binanceData.futureSymbols,
          },

          {
            exchange: "KUCOIN",
            data: kucoinData.futureSymbols,
          },
          {
            exchange: "COINDCX",
            data: coinDCXData.futureSymbols,
          },
        ],
      },
    ];
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Write data to file (overwrites if already exists)
    const response = await fs.writeFile(
      FILE_PATH,
      JSON.stringify(formattedData, null, 2),
      "utf-8"
    );

    console.log(response);
    return sendSuccess(res, "Symbol pairs updated successfully", formattedData);
  } catch (error: any) {
    switch (error.code) {
      case "BAD_REQUEST":
        return sendBadRequest(res, error.message);
      case "RATE_LIMITED":
        return sendBadRequest(res, error.message);
      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Failed to update symbol pairs"
        );
    }
  }
};

export async function getExchangePrecisionController(
  req: Request,
  res: Response
) {
  const { exchange, tradeType, symbol } = req.query;

  // if (!exchange || !tradeType ) {
  //   return res.status(400).json({
  //     message: "exchange and tradeType are required",
  //   });
  // }

  const precision = await getSymbolPrecision({
    exchange: exchange as string,
    tradeType: tradeType as "SPOT" | "FUTURES",
    symbol: symbol as string,
  });

  if (!precision) {
    return res.status(404).json({
      message: "Precision data not found",
    });
  }

  return res.json(precision);
}
export const refreshSymbolMetaController = async (
  _: Request,
  res: Response
) => {
  try {
    // 🔹 Fetch all symbol pairs from your source
    const formattedData = await fetchSymbolPairs();
    // 🔹 Log a sample to verify input

    // 🔹 Refresh spot/futures meta based on fetched symbol pairs
    await refreshSymbolMeta(formattedData);

    return res.status(200).json({
      success: true,
      message: "Symbol meta refreshed successfully",
    });
  } catch (error: any) {
    console.error("[META_REFRESH_ERROR]", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to refresh symbol meta",
    });
  }
};

export const verifyExchangeCredentialsController = async (
  req: Request,
  res: Response
) => {
  const { exchange, credentials } = req.body as {
    exchange: CryptoExchange;
    credentials: {
      apiKey: string;
      apiSecret: string;
      apiPassphrase?: string;
      apiKeyVersion?: string;
    };
  };

  if (!exchange || !credentials) {
    return sendBadRequest(res, "Exchange and credentials are required");
  }
  const { apiKey, apiSecret } = credentials;

  if (!apiKey || !apiSecret) {
    return sendBadRequest(res, "API key and secret are required");
  }

  try {
    const data = await verifyExchangeCredentials(exchange, credentials);

    return sendSuccess(res, "Credentials verified successfully", data);
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message || "Invalid credentials");

      case "RATE_LIMITED":
        return sendBadRequest(
          res,
          error.message || "Too many requests to exchange"
        );

      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message || "Exchange unavailable");
      case "UNSUPPORTED_EXCHANGE":
        return sendBadRequest(res, error.message);

      default:
        return sendServerError(
          res,
          error?.message || "Error verifying credentials "
        );
    }
  }
};

export const getBalancesController = async (req: any, res: Response) => {
  const { exchange, type } = req.body as {
    exchange: CryptoExchange;
    type: CryptoTradeType;
  };

  if (!exchange || !type) {
    return sendBadRequest(res, "Exchange, credentials, and type are required");
  }
  try {
    const creds = await getCryptoCredentials(req.user.userId, exchange);

    if (!creds) {
      return sendBadRequest(res, "No credentials found for this exchange");
    }

    const balances = await getExchangeBalances(exchange, creds, type);

    return sendSuccess(res, "Balances fetched successfully", balances);
  } catch (error: any) {
    switch (error.code) {
      case "AUTH_INVALID":
        return sendUnauthorized(res, error.message || "Invalid credentials");
      case "RATE_LIMITED":
        return sendBadRequest(res, error.message || "Too many requests");
      case "EXCHANGE_UNAVAILABLE":
        return sendServerError(res, error.message || "Exchange unavailable");
      case "UNSUPPORTED_EXCHANGE":
        return sendBadRequest(res, error.message);
      default:
        return sendServerError(
          res,
          error?.message || "Error fetching balances "
        );
    }
  }
};
