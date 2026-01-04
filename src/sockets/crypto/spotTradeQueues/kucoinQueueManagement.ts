type TradeKey = string;
type TradeMessage = { message: any; userId: string };

const tradeQueues: Map<TradeKey, TradeMessage[]> = new Map();
const processing: Set<TradeKey> = new Set();

function getTradeKey(message: any, userId: string): string {
  return `${userId}-${message.orderId}-${message.symbol || ""}`; // Add more fields if needed
}

export function enqueueTradeUpdate(
  message: any,
  userId: string,
  handler: (msg: any, uid: string) => Promise<void>
) {
  const key = getTradeKey(message, userId);

  if (!tradeQueues.has(key)) {
    tradeQueues.set(key, []);
  }

  tradeQueues.get(key)!.push({ message, userId });

  if (!processing.has(key)) {
    processQueue(key, handler);
  }
}

async function processQueue(
  key: TradeKey,
  handler: (msg: any, uid: string) => Promise<void>
) {
  const queue = tradeQueues.get(key);
  if (!queue) return;

  processing.add(key);

  while (queue.length > 0) {
    const { message, userId } = queue.shift()!;
    try {
      await handler(message, userId);
    } catch (err) {
      console.log("ERROR_PROCESSING_KUCOIN_QUEUE_MESSAGE", {
        queueKey: key,
        error:
          (err as any)?.data ||
          (err as any)?.response?.data ||
          (err as any)?.message ||
          err,
      });
    }
  }

  processing.delete(key);
  const queueToDelete = tradeQueues.get(key);
  if (queueToDelete && queueToDelete.length === 0) {
    tradeQueues.delete(key);
  }
}
export function getStatusPriority(status: string): number {
  const order = ["OPEN", "EXECUTED", "CANCELLED"];
  return order.indexOf(status.toUpperCase());
}
