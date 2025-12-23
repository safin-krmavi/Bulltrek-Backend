// services/tradeExecutionEngine.ts
import { CryptoExchange } from "@prisma/client";
import {
  createFuturesTrade,
  createSpotTrade,
} from "../crypto/exchange/tradeService";

type TradeSide = "BUY" | "SELL";

interface TradeOrder {
  userId: string;
  exchange: CryptoExchange;
  tradeType: "SPOT" | "FUTURES";
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  orderType: "MARKET" | "LIMIT";
  strategyId?: string;
  attempt?: number;
  onComplete?: () => void;
}

class TradeExecutionEngine {
  private queue: TradeOrder[] = [];
  private isProcessing = false;
  private maxRetries = 3;

  enqueue(
    order: TradeOrder,
    credentials: {
      apiKey: string;
      apiSecret: string;
      apiPassphrase?: string;
      apiKeyVersion?: string;
    }
  ) {
    order.attempt = 0;
    (order as any).credentials = credentials; // attach credentials to order
    this.queue.push(order);
    console.log("[TRADE_ENQUEUED]", { symbol: order.symbol, side: order.side });
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const order = this.queue.shift()!;
      const credentials = (order as any).credentials;

      try {
        console.log("[ORDER_CREDENTIALS]", credentials);

        if (order.tradeType === "SPOT") {
          await createSpotTrade(
            order.userId,
            order.exchange,
            credentials,
            order
          );
        } else {
          await createFuturesTrade(
            order.userId,
            order.exchange,
            credentials,
            order
          );
        }

        console.log("[TRADE_EXECUTED]", {
          symbol: order.symbol,
          side: order.side,
          strategyId: order.strategyId,
        });
        if (order.onComplete) order.onComplete();
      } catch (err) {
        console.error("[TRADE_FAILED]", { error: err, order });

        if ((order.attempt || 0) < this.maxRetries) {
          order.attempt! += 1;
          this.queue.push(order);
          console.log("[TRADE_REQUEUED]", { attempt: order.attempt });
        } else {
          console.warn("[TRADE_DISCARDED]", { order });
        }
      }
    }

    this.isProcessing = false;
  }

  getQueueLength() {
    return this.queue.length;
  }
}

export const tradeExecutionEngine = new TradeExecutionEngine();
