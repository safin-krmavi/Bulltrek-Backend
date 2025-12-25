export function handleZerodhaOrderUpdate(order: any, userId: string) {
  /**
   * order.status:
   * COMPLETE | REJECTED | CANCELLED | OPEN | TRIGGER PENDING
   */
  console.log("PROCESSING_ZERODHA_ORDER", {
    userId,
    orderId: order.order_id,
    status: order.status,
  });

  // 1. Update DB order record
  // 2. Match strategyId if linked
  // 3. Trigger strategyRuntimeRegistry if needed
}

export function handleZerodhaTradeUpdate(trade: any, userId: string) {
  console.log("PROCESSING_ZERODHA_TRADE", {
    userId,
    tradeId: trade.trade_id,
    orderId: trade.order_id,
    qty: trade.quantity,
    price: trade.price,
  });

  // 1. Update filled quantity
  // 2. PnL calc
  // 3. Notify frontend
}
