import { getCryptoCredentials } from "../crypto/credentialsService";
import { getStocksCredentials } from "../stocks/credentialsService";
import { tradeExecutionEngine } from "./tradeExecutionEngine";

export type TradeIntent = {
  userId: string;
  exchange: any;
  segment: "CRYPTO" | "STOCK";
  tradeType?: "SPOT" | "FUTURES"; // crypto only
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  orderType: "MARKET" | "LIMIT";
  strategyId?: string;

  // injected by dispatcher
  credentials?: any;

  attempt?: number;
  onComplete?: () => void;
};

export const tradeDispatcher = {
  async dispatch(intent: TradeIntent) {
    if (intent.segment === "CRYPTO") {
      const raw = await getCryptoCredentials(intent.userId, intent.exchange);
      const credentials = Array.isArray(raw) ? raw[0] : raw;
      if (!credentials) throw new Error("No crypto credentials");

      tradeExecutionEngine.enqueue({
        ...intent,
        credentials,
      });
      return;
    }

    if (intent.segment === "STOCK") {
      const raw = await getStocksCredentials(intent.userId, intent.exchange);
      const credentials = Array.isArray(raw) ? raw[0] : raw;
      if (!credentials) throw new Error("No stock credentials");

      tradeExecutionEngine.enqueue({
        ...intent,
        credentials,
      });
      return;
    }

    throw new Error("Unsupported segment");
  },
};
