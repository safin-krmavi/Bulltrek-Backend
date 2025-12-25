export function handleKotakOrderUpdate(order: any, userId: string) {
  /**
   * order.ordSt (order status):
   * complete | rejected | cancelled | open | trigger_pending
   */
  console.log("PROCESSING_KOTAK_ORDER", {
    userId,
    orderId: order.nOrdNo,
    status: order.ordSt,
    symbol: order.trdSym,
    quantity: order.qty,
    filledQuantity: order.fldQty,
    price: order.prc,
  });

  // 1. Update DB order record
  // 2. Match strategyId if linked
  // 3. Trigger strategyRuntimeRegistry if needed
}

export function handleKotakTradeUpdate(trade: any, userId: string) {
  console.log("PROCESSING_KOTAK_TRADE", {
    userId,
    tradeId: trade.flId,
    orderId: trade.nOrdNo,
    symbol: trade.trdSym,
    quantity: trade.fldQty,
    price: trade.avgPrc,
    transactionType: trade.trnsTp,
  });

  // 1. Update filled quantity in DB
  // 2. Recalculate PnL
  // 3. Notify frontend or strategy runtime
}
