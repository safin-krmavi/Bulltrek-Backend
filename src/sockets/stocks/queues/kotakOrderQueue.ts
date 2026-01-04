type KotakTradeKey = string;
type KotakTradeMessage = { message: any; userId: string };

const kotakTradeQueues: Map<KotakTradeKey, KotakTradeMessage[]> = new Map();
const kotakProcessing: Set<KotakTradeKey> = new Set();

function getKotakTradeKey(message: any, userId: string): string {
  return `${userId}-${message.i}-${message.s}`;
}

export function enqueueKotakTradeUpdate(
  message: any,
  userId: string,
  handler: (message: any, userId: string) => Promise<void>
) {
  const key = getKotakTradeKey(message, userId);
  if (!kotakTradeQueues.has(key)) kotakTradeQueues.set(key, []);
  kotakTradeQueues.get(key)!.push({ message, userId });

  if (!kotakProcessing.has(key)) {
    processdKotakTradeQueue(key, handler);
  }
}

async function processdKotakTradeQueue(
  key: KotakTradeKey,
  handler: (message: any, userId: string) => Promise<void>
) {
  const queue = kotakTradeQueues.get(key);
  if (!queue) return;

  kotakProcessing.add(key);

  while (queue.length > 0) {
    const { message, userId } = queue.shift()!;
    try {
      await handler(message, userId);
    } catch (err) {
      console.log("ERROR_PROCESSING_KOTAK_TRADE", {
        queueKey: key,
        error:
          (err as any)?.data ||
          (err as any)?.response?.data ||
          (err as any)?.message ||
          err,
      });
    }
  }

  kotakProcessing.delete(key);
  const queueToDelete = kotakTradeQueues.get(key);
  if (queueToDelete && queueToDelete.length === 0) {
    kotakTradeQueues.delete(key);
  }
}
