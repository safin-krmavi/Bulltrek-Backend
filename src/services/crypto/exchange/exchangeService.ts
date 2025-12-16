import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import fs from "fs/promises";
import {
  getBinanceFuturesBalances,
  getBinanceSpotBalances,
  verifyBinanceCredentials,
} from "./binanceService";
import {
  getKucoinFuturesBalances,
  getKucoinSpotBalances,
  verifyKucoinCredentials,
} from "./kucoinService";
import {
  getCoinDCXFuturesBalances,
  getCoinDCXSpotBalances,
  verifyCoinDCXCredentials,
} from "./coindcxService";
import { FILE_PATH } from "../../../constants/crypto";

export const fetchSymbolPairs = async () => {
  //read the file from data/symbol_pairs.json
  try {
    const data = await fs.readFile(FILE_PATH, "utf-8");
    const parsedData = JSON.parse(data);
    return parsedData;
  } catch (error: any) {
    throw {
      code: "SERVER_ERROR",
      message: "Failed to read symbol pairs data",
    };
  }
};
export async function verifyExchangeCredentials(
  exchange: CryptoExchange,
  creds: any
) {
  switch (exchange) {
    case CryptoExchange.BINANCE:
      return verifyBinanceCredentials(creds);
    case CryptoExchange.KUCOIN:
      return verifyKucoinCredentials(creds);
    case CryptoExchange.COINDCX:
      return verifyCoinDCXCredentials(creds);
    default:
      throw {
        code: "UNSUPPORTED_EXCHANGE",
        message: "Unsupported exchange",
      };
  }
}

export async function getExchangeBalances(
  exchange: CryptoExchange,
  credentials: any,
  type: CryptoTradeType
) {
  switch (exchange) {
    case CryptoExchange.BINANCE:
      return type === CryptoTradeType.SPOT
        ? getBinanceSpotBalances(credentials)
        : getBinanceFuturesBalances(credentials);

    case CryptoExchange.KUCOIN:
      return type === CryptoTradeType.SPOT
        ? getKucoinSpotBalances(credentials)
        : getKucoinFuturesBalances(credentials);

    case CryptoExchange.COINDCX:
      return type === CryptoTradeType.SPOT
        ? getCoinDCXSpotBalances(credentials)
        : getCoinDCXFuturesBalances(credentials);

    default:
      throw { code: "UNSUPPORTED_EXCHANGE", message: "Unsupported exchange" };
  }
}
