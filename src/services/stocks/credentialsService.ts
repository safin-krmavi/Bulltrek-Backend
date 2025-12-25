import { StocksExchange } from "@prisma/client";
import prisma from "../../config/db.config"; 

export async function addOrUpdateStocksCredentials(data: {
  userId: string;
  exchange: StocksExchange;
  apiKey: string;
  clientCode?: string;
  accessToken?: string;
  refreshToken?: string;
  feedToken?: string;
  expiresAt: Date;
}) {
  const existing = await prisma.stocksCredentials.findUnique({
    where: {
      userId_exchange: { userId: data.userId, exchange: data.exchange },
    },
  });

  if (existing) {
    return prisma.stocksCredentials.update({
      where: {
        userId_exchange: { userId: data.userId, exchange: data.exchange },
      },
      data,
    });
  }

  return prisma.stocksCredentials.create({ data });
}

export async function getStocksCredentials(
  userId: string,
  exchange?: StocksExchange
) {
  if (exchange) {
    return prisma.stocksCredentials.findUnique({
      where: { userId_exchange: { userId, exchange } },
    });
  } else {
    return prisma.stocksCredentials.findMany({ where: { userId } });
  }
}

export async function updateStocksCredentials(
  id: string,
  data: Partial<{
    apiKey: string;
    clientCode: string;
    accessToken: string;
    refreshToken: string;
    feedToken: string;
    expiresAt: Date;
  }>
) {
  return prisma.stocksCredentials.update({ where: { id }, data });
}

export async function deleteStocksCredentials(id: string) {
  return prisma.stocksCredentials.delete({ where: { id } });
}
