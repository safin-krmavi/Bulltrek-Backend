import { TradeStatus } from "@prisma/client";

export function mapKotakOrderStatus(ordSt: string): TradeStatus {
  switch (ordSt.toLowerCase()) {
    case "put order req received":
    case "open":
      return TradeStatus.OPEN;

    case "partially filled":
      return TradeStatus.PARTIALLY_FILLED;

    case "complete":
    case "filled":
      return TradeStatus.EXECUTED;

    case "cancelled":
      return TradeStatus.CANCELLED;

    case "rejected":
      return TradeStatus.REJECTED;

    default:
      return TradeStatus.OPEN;
  }
}
