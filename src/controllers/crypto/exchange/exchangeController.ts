import { Request, Response } from "express";
import {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendServerError,
} from "../../../utils/response";
import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import {
  getExchangeBalances,
  verifyExchangeCredentials,
} from "../../../services/crypto/exchange/exchangeService";
import { getCryptoCredentials } from "../../../services/crypto/credentialsService";
import { getBinanceUSDTData } from "../../../services/crypto/exchange/binanceService";
import { getKucoinAllData } from "../../../services/crypto/exchange/kucoinService";
import { getCoinDCXAllData } from "../../../services/crypto/exchange/coindcxService";
import fs from "fs/promises";
import { FILE_PATH, DATA_DIR } from "../../../constants/crypto";
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
        type: "SPOT",
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
        type: "FUTURES",
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
    console.log("hello");
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
