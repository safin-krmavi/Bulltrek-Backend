import { CryptoExchange } from "@prisma/client";
import prisma from "../../../config/db.config";
import {
  handleFilledFuturesOrder,
  updateTradeStatus,
} from "../../../services/crypto/exchangeSocketServices/kucoinSocketServices";

const kucoinTradeUpdateQueues: Map<string, any[]> = new Map();
const kucoinTradeUpdateProcessing: Set<string> = new Set();

async function processKucoinUpdateQueue(key: string, userId: string) {
  const queue = kucoinTradeUpdateQueues.get(key);
  if (!queue) return;

  kucoinTradeUpdateProcessing.add(key);

  while (queue.length > 0) {
    const { data, credentials } = queue.shift()!;

    const MAX_ATTEMPTS = 10;
    let attempt = 0;
    let tradeFound = false;

    while (attempt < MAX_ATTEMPTS && !tradeFound) {
      const trade = await prisma.cryptoTrades.findFirst({
        where: {
          userId,
          orderId: data.orderId,
          exchange: CryptoExchange.KUCOIN,
        },
      });

      if (trade) {
        tradeFound = true;

        // ✅ Apply update
        try {
          // await updateTradeStatus(userId, data);

          // if (
          //   data.type === "filled" &&
          //   data.status?.toLowerCase() === "done" &&
          //   parseFloat(data.filledSize) > 0
          // ) {
          await handleFilledFuturesOrder(data, userId, credentials);
          // }
        } catch (err) {
          console.log("ERROR_UPDATING_KUCOIN_TRADE", {
            error: err,
          });
          //
        }
      } else {
        await new Promise((res) => setTimeout(res, 1000)); // wait 1 sec
        attempt++;
      }
    }

    if (!tradeFound) {
      console.log("TRADE_NOT_FOUND_AFTER_POLLING", { key });
    }
  }

  kucoinTradeUpdateProcessing.delete(key);
  kucoinTradeUpdateQueues.delete(key);
}

export function enqueueKucoinUpdate(
  userId: string,
  data: any,
  credentials: any
) {
  const key = `${userId}-KUCOIN-${data.orderId}`;
  if (!kucoinTradeUpdateQueues.has(key)) {
    kucoinTradeUpdateQueues.set(key, []);
  }
  kucoinTradeUpdateQueues.get(key)!.push({ data, credentials });

  if (!kucoinTradeUpdateProcessing.has(key)) {
    processKucoinUpdateQueue(key, userId);
  }
}
