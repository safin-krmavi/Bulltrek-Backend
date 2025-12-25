import {
  createSpotTrade,
  createFuturesTrade,
} from "../crypto/exchange/tradeService";
import { placeStockOrder } from "../stocks/exchange/exchangeService";
import { TradeIntent } from "./tradeDispatcher";

class TradeExecutionEngine {
  private queues: Record<string, TradeIntent[]> = {};
  private processing: Record<string, boolean> = {};
  private maxRetries = 3;

  enqueue(intent: TradeIntent) {
    intent.attempt = 0;

    const key = this.getQueueKey(intent);

    if (!this.queues[key]) this.queues[key] = [];
    if (!this.processing[key]) this.processing[key] = false;

    this.queues[key].push(intent);
    this.processQueue(key);
  }

  private getQueueKey(order: TradeIntent) {
    return `${order.segment}:${order.exchange}`;
  }

  private async processQueue(key: string) {
    if (this.processing[key]) return;
    this.processing[key] = true;

    const queue = this.queues[key];

    while (queue.length > 0) {
      const order = queue.shift()!;

      try {
        if (!order.credentials) {
          throw new Error("Missing credentials");
        }

        if (order.segment === "CRYPTO") {
          await this.executeCrypto(order);
        } else {
          await this.executeStock(order);
        }

        order.onComplete?.();
      } catch (err) {
        if ((order.attempt ?? 0) < this.maxRetries) {
          order.attempt = (order.attempt ?? 0) + 1;
          queue.push(order);
        }
      }
    }
    if (queue.length === 0) {
      delete this.queues[key];
      delete this.processing[key];
    }

    this.processing[key] = false;
  }

  private async executeCrypto(order: TradeIntent) {
    if (order.tradeType === "SPOT") {
      await createSpotTrade(
        order.userId,
        order.exchange,
        order.credentials,
        order
      );
    } else {
      await createFuturesTrade(
        order.userId,
        order.exchange,
        order.credentials,
        order
      );
    }
  }

  private async executeStock(order: TradeIntent) {
    await placeStockOrder(order.exchange, order.credentials, {
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      orderType: order.orderType,
      price: order.price,
      product: "INTRADAY",
      exchange: "NSE",
    });
  }
}

export const tradeExecutionEngine = new TradeExecutionEngine();
