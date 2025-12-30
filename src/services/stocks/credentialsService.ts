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

  const credentials = existing
    ? await prisma.stocksCredentials.update({
        where: {
          userId_exchange: { userId: data.userId, exchange: data.exchange },
        },
        data,
      })
    : await prisma.stocksCredentials.create({ data });

  if (data.expiresAt <= new Date()) {
    throw new Error("CANNOT_RESUME_WITH_EXPIRED_CREDENTIALS");
  }

  // 🔁 RESUME paused STOCK strategies
  const resumed = await prisma.strategy.updateMany({
    where: {
      userId: data.userId,
      exchange: data.exchange,
      assetType: "STOCK",
      status: "PAUSED",
    },
    data: {
      status: "ACTIVE",
    },
  });

  if (resumed.count > 0) {
    await prisma.notification.create({
      data: {
        userId: data.userId,
        type: "STRATEGY_RESUMED",
        severity: "INFO",
        title: "Strategies resumed",
        message:
          "Your stock strategies have been resumed after successful login.",
        meta: {
          exchange: data.exchange,
          resumedCount: resumed.count,
        },
      },
    });
  }

  return credentials;
}
export async function getStocksCredentials(
  userId: string,
  exchange?: StocksExchange
) {
  const creds = exchange
    ? await prisma.stocksCredentials.findUnique({
        where: { userId_exchange: { userId, exchange } },
      })
    : await prisma.stocksCredentials.findMany({ where: { userId } });

  const now = new Date();

  if (Array.isArray(creds)) {
    return creds.map(c => ({ ...c, isExpired: c.expiresAt <= now }));
  }

  return creds ? { ...creds, isExpired: creds.expiresAt <= now } : null;
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

export async function getConnectedStockExchanges(userId: string) {
  try {
    const credentials = await prisma.stocksCredentials.findMany({
      where: { userId },
      select: {
        exchange: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Check if credentials are expired
    const now = new Date();
    const connectedExchanges = credentials.map((cred) => ({
      exchange: cred.exchange,
      isActive: cred.expiresAt > now,
      expiresAt: cred.expiresAt,
      connectedAt: cred.createdAt,
    }));

    return connectedExchanges;
  } catch (error) {
    console.error("ERROR_GETTING_CONNECTED_EXCHANGES", error);
    throw error;
  }
}