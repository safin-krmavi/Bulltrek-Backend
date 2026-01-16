type CoinDCXTradeKey = string;
type CoinDCXTradeMessage = { message: any; userId: string };

const coindcxTradeQueues: Map<CoinDCXTradeKey, CoinDCXTradeMessage[]> =
  new Map();
const coindcxProcessing: Set<CoinDCXTradeKey> = new Set();

function getCoinDCXTradeKey(message: any, userId: string): string {
  // Use userId + orderId + market symbol as the unique key
  return `${userId}-${message.id || message.order_id}-${message.market || ""}`;
}

/**
 * Enqueue a CoinDCX trade update message for sequential processing.
 */
export function enqueueCoinDCXTradeUpdate(
  message: any,
  userId: string,
  handler: (msg: any, uid: string) => Promise<void>
) {
  const key = getCoinDCXTradeKey(message, userId);

  if (!coindcxTradeQueues.has(key)) {
    coindcxTradeQueues.set(key, []);
  }

  coindcxTradeQueues.get(key)!.push({ message, userId });
  console.log("COINDCX_MESSAGE_ENQUEUED", { queueKey: key });
  console.log("COINDCX_QUEUE_STATUS", {
    queueKey: key,
    queueData: coindcxTradeQueues.get(key)?.map((entry, index) => ({
      index,
      userId: entry.userId,
      id: entry.message?.id || entry.message?.order_id,
      market: entry.message?.market,
    })),
  });

  if (!coindcxProcessing.has(key)) {
    processCoinDCXQueue(key, handler);
  }
}

/**
 * Process the CoinDCX trade queue sequentially per key.
 */
async function processCoinDCXQueue(
  key: CoinDCXTradeKey,
  handler: (msg: any, uid: string) => Promise<void>
) {
  const queue = coindcxTradeQueues.get(key);
  if (!queue) return;

  console.log("PROCESSING_COINDCX_QUEUE", { queueKey: key });
  coindcxProcessing.add(key);
  while (queue.length > 0) {
    const { message, userId } = queue.shift()!;
    try {
      await handler(message, userId);
    } catch (err) {
      console.log("ERROR_PROCESSING_COINDCX_TRADE", {
        queueKey: key,
        error:
          (err as any)?.data ||
          (err as any)?.response?.data ||
          (err as any)?.message ||
          err,
      });
    }
  }

  coindcxProcessing.delete(key);

  // Clean up empty queue to free memory
  const queueToDelete = coindcxTradeQueues.get(key);
  if (queueToDelete && queueToDelete.length === 0) {
    coindcxTradeQueues.delete(key);
  }
}
