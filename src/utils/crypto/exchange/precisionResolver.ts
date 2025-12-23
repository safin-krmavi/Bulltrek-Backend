import { getBinanceSymbolMeta } from "./binanceSymbolMetaReader";

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

  //   if (exchange === "KUCOIN") {
  //     return getKucoinSymbolMeta(symbol);
  //   }

  return null;
}
