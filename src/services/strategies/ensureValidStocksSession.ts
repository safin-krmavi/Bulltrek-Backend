import prisma from "../../config/db.config";
import { StocksExchange } from "@prisma/client";

export async function ensureValidStocksSession(params: {
  userId: string;
  exchange: StocksExchange;
}) {
  const creds = await prisma.stocksCredentials.findUnique({
    where: {
      userId_exchange: {
        userId: params.userId,
        exchange: params.exchange,
      },
    },
  });

  if (!creds) {
    throw new Error("STOCKS_CREDENTIALS_MISSING");
  }


  if (creds.expiresAt <= new Date()) {
    throw {
      code: "STOCK_SESSION_EXPIRED",
      reason: "TIME_EXPIRED",
    };
  }

  return creds;
}
