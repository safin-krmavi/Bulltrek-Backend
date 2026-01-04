import { CryptoExchange, CryptoTradeType } from "@prisma/client";
import fs from "fs/promises";
import {
  fetchBinanceSpotBalances,
  fetchBinanceFuturesBalances,
  verifyBinanceCredentials,
} from "./binanceService";
import {
  fetchKucoinFuturesBalances,
  fetchKucoinSpotBalances,
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
} from "../../../utils/crypto/exchange/symbolInfo/binanceSymbolMeta";
import {
  updateKucoinFuturesSymbolMeta,
  updateKucoinSpotSymbolMeta,
} from "../../../utils/crypto/exchange/symbolInfo/kucoinSymbolMeta";
import {
  updateCoindcxFuturesSymbolMeta,
  updateCoinDCXSpotSymbolMeta,
} from "../../../utils/crypto/exchange/symbolInfo/coindcxSymbolMeta";

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
        ? fetchBinanceSpotBalances(credentials)
        : fetchBinanceFuturesBalances(credentials);

    case CryptoExchange.KUCOIN:
      return type === CryptoTradeType.SPOT
        ? fetchKucoinSpotBalances(credentials)
        : fetchKucoinFuturesBalances(credentials);

    case CryptoExchange.COINDCX:
      return type === CryptoTradeType.SPOT
        ? getCoinDCXSpotBalances(credentials)
        : getCoinDCXFuturesBalances(credentials);

    default:
      throw { code: "UNSUPPORTED_EXCHANGE", message: "Unsupported exchange" };
  }
}
/**
 * Main service to refresh symbol meta
 */
export async function refreshSymbolMeta(formattedData: any) {
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

  const kucoinSpotSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_SPOT")
      ?.data.find((d: any) => d.exchange === "KUCOIN")?.data ?? []
  ).map((s: any) => s.symbol);

  const kucoinFuturesSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_FUTURES")
      ?.data.find((d: any) => d.exchange === "KUCOIN")?.data ?? []
  ).map((s: any) => s.symbol);

  console.log(
    "[REFRESH_SYMBOL_META] KUCOIN SPOT symbols count:",
    kucoinSpotSymbols.length
  );
  console.log(
    "[REFRESH_SYMBOL_META] KUCOIN FUTURES symbols count:",
    kucoinFuturesSymbols.length
  );

  const coindcxSpotSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_SPOT")
      ?.data.find((d: any) => d.exchange === "COINDCX")?.data ?? []
  ).map((s: any) => s.symbol);

  const coindcxFuturesSymbols: string[] = (
    formattedData
      .find((item: any) => item.type === "CRYPTO_FUTURES")
      ?.data.find((d: any) => d.exchange === "COINDCX")?.data ?? []
  ).map((s: any) => s.symbol);

  console.log(
    "[REFRESH_SYMBOL_META] COINDCX SPOT symbols count:",
    coindcxSpotSymbols.length
  );
  console.log(
    "[REFRESH_SYMBOL_META] COINDCX FUTURES symbols count:",
    coindcxFuturesSymbols.length
  );

  // Run all updates and collect results
  const [binSpot, binFut,  coindcxSpot, coindcxFut] =
    await Promise.all([
      updateBinanceSpotSymbolMeta(binanceSpotSymbols),
      updateBinanceFuturesSymbolMeta(binanceFuturesSymbols),
      // updateKucoinSpotSymbolMeta(kucoinSpotSymbols),
      // updateKucoinFuturesSymbolMeta(kucoinFuturesSymbols),
      updateCoinDCXSpotSymbolMeta(coindcxSpotSymbols),
      updateCoindcxFuturesSymbolMeta(coindcxFuturesSymbols),
    ]);
  console.log("DONE");
  // Return all results
  return {
    binance: {
      spot: binSpot,
      futures: binFut,
    },
  
    coindcx: {
      spot: coindcxSpot,
      futures: coindcxFut,
    },
  };
}
