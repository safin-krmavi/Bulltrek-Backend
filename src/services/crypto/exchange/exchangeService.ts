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
import {
  updateBinanceFuturesSymbolMeta,
  updateBinanceSpotSymbolMeta,
} from "../../../utils/crypto/exchange/binanceSymbolMeta";

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
/**
 * Main service to refresh Binance symbol meta
 */
export async function refreshSymbolMeta(formattedData: any) {
  // Extract the relevant symbol arrays from your formatted structure
  const binanceSpotSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_SPOT")
      ?.data.find((d: any) => d.exchange === "BINANCE")?.data ?? []
  ).map((s: any) => s.symbol);

  const binanceFuturesSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_FUTURES")
      ?.data.find((d: any) => d.exchange === "BINANCE")?.data ?? []
  ).map((s: any) => s.symbol);

  console.log(
    "[REFRESH_SYMBOL_META] BINANCE SPOT symbols count:",
    binanceSpotSymbols.length
  );
  console.log(
    "[REFRESH_SYMBOL_META] BINANCE FUTURES symbols count:",
    binanceFuturesSymbols.length
  );
  console.log(
    "[REFRESH_SYMBOL_META] Sample SPOT symbols:",
    binanceSpotSymbols.slice(0, 5)
  );
  console.log(
    "[REFRESH_SYMBOL_META] Sample FUTURES symbols:",
    binanceFuturesSymbols.slice(0, 5)
  );

  await Promise.all([
    updateBinanceSpotSymbolMeta(binanceSpotSymbols),
    updateBinanceFuturesSymbolMeta(binanceFuturesSymbols),
  ]);
}
