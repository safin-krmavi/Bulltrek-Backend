import {
  CryptoExchange,
  CryptoTradeType,
  TradeStatus,
  TradeSide,
} from "@prisma/client";
import db from "../../config/db.config";

export async function createOrderIntent({
  userId,
  exchange,
  type,
  symbol,
  side,
  requestedQty,
  requestedPrice,
  orderType,
}: {
  userId: string;
  exchange: CryptoExchange;
  type: CryptoTradeType;
  symbol: string;
  side: TradeSide;
  requestedQty: number | string;
  requestedPrice?: number | string;
  orderType: string;
}) {
  try {
    return await db.cryptoOrder.create({
      data: {
        userId,
        exchange,
        type,
        symbol,
        side,
        requestedQty: Number(requestedQty), // cast to float
        requestedPrice: requestedPrice ? Number(requestedPrice) : undefined,
        orderType,
        status: TradeStatus.OPEN,
        exchangeOrderId: null, // or temporary UUID if needed
      },
    });
  } catch (error) {
    console.log("ERROR_CREATING_ORDER_INTENT", {
      userId,
      exchange,
      requestedQty,
      requestedPrice,
      orderType,
      error,
    });
    throw error;
  }
}
