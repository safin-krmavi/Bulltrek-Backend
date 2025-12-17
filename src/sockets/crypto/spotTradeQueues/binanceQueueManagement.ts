type BinanceTradeKey = string;
type BinanceTradeMessage = { message: any; clientId: string };

const binanceTradeQueues: Map<BinanceTradeKey, BinanceTradeMessage[]> =
  new Map();
const binanceProcessing: Set<BinanceTradeKey> = new Set();

function getBinanceTradeKey(message: any, clientId: string): string {
  return `${clientId}-${message.i}-${message.s}`;
}

export function enqueueBinanceTradeUpdate(
  message: any,
  clientId: string,
  handler: (msg: any, uid: string) => Promise<void>
) {
  const key = getBinanceTradeKey(message, clientId);
  if (!binanceTradeQueues.has(key)) binanceTradeQueues.set(key, []);
  binanceTradeQueues.get(key)!.push({ message, clientId });

  if (!binanceProcessing.has(key)) {
    processBinanceTradeQueue(key, handler);
  }
}

async function processBinanceTradeQueue(
  key: BinanceTradeKey,
  handler: (msg: any, uid: string) => Promise<void>
) {
  const queue = binanceTradeQueues.get(key);
  if (!queue) return;

  binanceProcessing.add(key);

  while (queue.length > 0) {
    const { message, clientId } = queue.shift()!;
    try {
      await handler(message, clientId);
    } catch (err) {
      console.log("ERROR_PROCESSING_BINANCE_TRADE", {
        queueKey: key,
        error:
          (err as any)?.data ||
          (err as any)?.response?.data ||
          (err as any)?.message ||
          err,
      });
    }
  }

  binanceProcessing.delete(key);
  const queueToDelete = binanceTradeQueues.get(key);
  if (queueToDelete && queueToDelete.length === 0) {
    binanceTradeQueues.delete(key);
  }
}
