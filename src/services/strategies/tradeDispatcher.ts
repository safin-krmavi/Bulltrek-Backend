import { handleExpiredSession } from "../../utils/strategyUtils";
import { getCryptoCredentials } from "../crypto/credentialsService";
import { getStocksCredentials } from "../stocks/credentialsService";
import { ensureValidStocksSession } from "./ensureValidStocksSession";
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
    console.log(`[Dispatcher] Dispatching trade intent:`, intent);

    if (intent.segment === "CRYPTO") {
      const raw = await getCryptoCredentials(intent.userId, intent.exchange);
      const credentials = Array.isArray(raw) ? raw[0] : raw;
      if (!credentials) throw new Error("No crypto credentials");
      console.log(
        `[Dispatcher] Enqueuing crypto trade for symbol: ${intent.symbol}`
      );

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
      try {
        console.log(
          `[Dispatcher] Ensuring valid stock session for user: ${intent.userId}`
        );

        await ensureValidStocksSession({
          userId: intent.userId,
          exchange: intent.exchange,
        });
      } catch (err) {
        console.warn(
          `[Dispatcher] Stocks session expired, handling for user: ${intent.userId}`,
          err
        );

        await handleExpiredSession(intent, err);
        return;
      }
      console.log(
        `[Dispatcher] Enqueuing stock trade for symbol: ${intent.symbol}`
      );

      tradeExecutionEngine.enqueue({
        ...intent,
        credentials,
      });
      return;
    }

    throw new Error("Unsupported segment");
  },
};
