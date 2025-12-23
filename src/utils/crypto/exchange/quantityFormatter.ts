import Decimal from "decimal.js";
import { getSymbolPrecision } from "./precisionResolver";
import { CryptoExchange, CryptoTradeType } from "@prisma/client";

export async function formatQuantity(params: {
  exchange: string;
  tradeType: string;
  symbol: string;
  rawQty: number;
}) {
  const meta = await getSymbolPrecision(params);
  if (!meta?.quantityStep) return params.rawQty;

  const step = new Decimal(meta.quantityStep);

  return new Decimal(params.rawQty).div(step).floor().mul(step).toNumber();
}
