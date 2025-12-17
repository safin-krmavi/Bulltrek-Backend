import { fetchSymbolPairs } from "../../../services/crypto/exchange/exchangeService";

export async function resolveAngelToken(
  symbol: string,
  exchange: string
): Promise<string> {
  try {
    // Fetch all symbol pairs
    const symbolPairs = await fetchSymbolPairs();

    // Look for AngelOne stock types
    const stockTypes = ["STOCK_CASH", "STOCK_FUTURES", "STOCK_OPTIONS"];

    for (const type of stockTypes) {
      const typeData = symbolPairs.find((item: any) => item.type === type);
      if (!typeData) continue;

      const exchangeData = typeData.data.find(
        (ex: any) => ex.exchange === exchange
      );
      if (!exchangeData) continue;

      const instrument = exchangeData.data.find(
        (inst: any) => inst.symbol === symbol
      );

      if (instrument && instrument.token) {
        return instrument.token;
      }
    }

    throw new Error(`AngelOne token not found for ${symbol} on ${exchange}`);
  } catch (error: any) {
    console.error("ERROR_RESOLVING_ANGEL_TOKEN", {
      error: error?.data || error?.response?.data || error.message,
    });
    throw error;
  }
}
