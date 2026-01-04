import { getBinanceSymbolMeta } from "./symbolInfo/binanceSymbolMetaReader";
import { getCoindcxSymbolMeta } from "./symbolInfo/coindcxSymbolMetaReader";
import { getKucoinSymbolMeta } from "./symbolInfo/kucoinSymbolMetaReader";

export async function getSymbolPrecision(params: {
  exchange: string;
  tradeType: string;
  symbol: string;
}) {
  const { exchange, tradeType, symbol } = params;
  if (exchange === "BINANCE") {
    if (tradeType === "SPOT") {
      return getBinanceSymbolMeta(symbol, "SPOT");
    }
    if (tradeType === "FUTURES") {
      return getBinanceSymbolMeta(symbol, "FUTURES");
    }
  }

  if (exchange === "KUCOIN") {
    if (tradeType === "SPOT") {
      return getKucoinSymbolMeta(symbol, "SPOT");
    }
    if (tradeType === "FUTURES") {
      return getKucoinSymbolMeta(symbol, "FUTURES");
    }
  }
  if (exchange === "COINDCX") {
    if (tradeType === "SPOT") {
      return getCoindcxSymbolMeta(symbol, "SPOT");
    }
    if (tradeType === "FUTURES") {
      return getCoindcxSymbolMeta(symbol, "FUTURES");
    }
  }

  return null;
}
