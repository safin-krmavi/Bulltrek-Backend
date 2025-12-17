type CoinDCXFuturesKey = string;
type CoinDCXFuturesMessage = { message: any; clientId: string };

const coindcxFuturesQueues: Map<CoinDCXFuturesKey, CoinDCXFuturesMessage[]> =
  new Map();
const coindcxFuturesProcessing: Set<CoinDCXFuturesKey> = new Set();
function logFullQueueState() {
  console.log("COINDCX_FUTURES_QUEUE_STATE", {
    message: "Full CoinDCX Futures Queue State",
  });
  for (const [key, queue] of coindcxFuturesQueues.entries()) {
    console.log("COINDCX_FUTURES_QUEUE_KEY", {
      queueKey: key,
      queueData: queue.map((q, i) => ({
        index: i,
        clientId: q.clientId,
        id: q.message?.id || q.message?.order_id,
        pair: q.message?.pair,
      })),
    });
  }
}
function getCoinDCXFuturesKey(message: any, clientId: string): string {
  return `${clientId}-COINDCX-${message.id || message.order_id}-${
    message.pair || ""
  }`;
}

async function processCoinDCXFuturesQueue(
  key: CoinDCXFuturesKey,
  handler: (msg: any, uid: string) => Promise<void>
) {
  const queue = coindcxFuturesQueues.get(key);
  if (!queue) return;

  coindcxFuturesProcessing.add(key);

  while (queue.length > 0) {
    const { message, clientId } = queue.shift()!;
    logFullQueueState();
    try {
      await handler(message, clientId);
    } catch (err) {
      console.log("ERROR_PROCESSING_COINDCX_FUTURES_TRADE", {
        queueKey: key,
        error:
          (err as any)?.data ||
          (err as any)?.response?.data ||
          (err as any)?.message ||
          err,
      });
    }
  }

  coindcxFuturesProcessing.delete(key);
  const queueToDelete = coindcxFuturesQueues.get(key);
  if (queueToDelete?.length === 0) {
    coindcxFuturesQueues.delete(key);
  }
}

export function enqueueCoinDCXFuturesUpdate(
  message: any,
  clientId: string,
  handler: (msg: any, uid: string) => Promise<void>
) {
  const key = getCoinDCXFuturesKey(message, clientId);

  if (!coindcxFuturesQueues.has(key)) {
    coindcxFuturesQueues.set(key, []);
  }

  coindcxFuturesQueues.get(key)!.push({ message, clientId });

  if (!coindcxFuturesProcessing.has(key)) {
    processCoinDCXFuturesQueue(key, handler);
  }
}
