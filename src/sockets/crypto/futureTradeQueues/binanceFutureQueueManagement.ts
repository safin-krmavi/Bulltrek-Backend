import { CryptoExchange } from "@prisma/client";
import prisma from "../../../config/db.config";
import {
  handleFilledBinanceFuturesOrder,
  updateBinanceFuturesTradeStatus,
} from "../../../services/crypto/exchangeSocketServices/binanceSocketService";

const binanceFuturesUpdateQueues: Map<string, any[]> = new Map();
const binanceFuturesUpdateProcessing: Set<string> = new Set();

async function processBinanceFuturesUpdateQueue(key: string, userId: string) {
  const queue = binanceFuturesUpdateQueues.get(key);
  if (!queue) return;

  binanceFuturesUpdateProcessing.add(key);

  while (queue.length > 0) {
    const { order, credentials } = queue.shift()!;

    const MAX_ATTEMPTS = 10;
    let attempt = 0;
    let tradeFound = false;

    while (attempt < MAX_ATTEMPTS && !tradeFound) {
      const trade = await prisma.cryptoTrades.findFirst({
        where: {
          userId,
          exchange: CryptoExchange.BINANCE,
          orderId: order.i.toString(),
        },
      });

      // if (trade) {
      tradeFound = true;

      try {
        // await updateBinanceFuturesTradeStatus(userId, order, credentials);

        //  TODO : Handle PARTIALLY_EXECUTED Orders

        // if (order.status === "FILLED" || order.X === "FILLED") {
        console.log("BINANCE FUTURES ORDER");
        await handleFilledBinanceFuturesOrder(userId, order, credentials);
      } catch (err) {
        console.log("ERROR_UPDATING_BINANCE_FUTURES_TRADE_STATUS", {
          queueKey: key,
          error:
            (err as any)?.data ||
            (err as any)?.response?.data ||
            (err as any)?.message ||
            err,
        });
      }
      // } else {
      //   await new Promise((res) => setTimeout(res, 1000)); // wait 1s
      //   attempt++;
      // }
    }

    if (!tradeFound) {
      console.log("BINANCE_FUTURES_TRADE_NOT_FOUND_AFTER_POLLING", {
        queueKey: key,
      });
    }
  }

  binanceFuturesUpdateProcessing.delete(key);
  binanceFuturesUpdateQueues.delete(key);
}

export function enqueueBinanceFuturesUpdate(
  userId: string,
  order: any,
  credentials: any
) {
  const key = `${userId}-BINANCE-${order.orderId}`;
  if (!binanceFuturesUpdateQueues.has(key)) {
    binanceFuturesUpdateQueues.set(key, []);
  }

  binanceFuturesUpdateQueues.get(key)!.push({ order, credentials });

  if (!binanceFuturesUpdateProcessing.has(key)) {
    processBinanceFuturesUpdateQueue(key, userId);
  }
}
