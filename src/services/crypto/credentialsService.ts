// services/crypto/credentialsService.ts
import { CryptoExchange } from "@prisma/client";
import prisma from "../../config/db.config";
import {
  decodeCredentials,
  encodeCredentials,
} from "../../utils/credentialUtils";

// Add or update credentials
export async function addOrUpdateCryptoCredentials(data: {
  userId: string;
  exchange: CryptoExchange;
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiKeyVersion?: string;
}) {
  const encryptedData = {
    ...data,
    ...encodeCredentials(
      data.apiKey,
      data.apiSecret,
      data.apiPassphrase,
      data.apiKeyVersion
    ),
  };

  const existing = await prisma.cryptoCredentials.findUnique({
    where: {
      userId_exchange: { userId: data.userId, exchange: data.exchange },
    },
  });

  if (existing) {
    return prisma.cryptoCredentials.update({
      where: {
        userId_exchange: { userId: data.userId, exchange: data.exchange },
      },
      data: encryptedData,
    });
  }
  return prisma.cryptoCredentials.create({ data: encryptedData });
}

export async function getCryptoCredentials(
  userId: string,
  exchange?: CryptoExchange
) {
  if (exchange) {
    const cred = await prisma.cryptoCredentials.findUnique({
      where: { userId_exchange: { userId, exchange } },
    });
    if (!cred) return null;
    return {
      ...cred,
      ...decodeCredentials(
        cred.apiKey,
        cred.apiSecret,
        cred.apiPassphrase,
        cred.apiKeyVersion
      ),
    };
  } else {
    const creds = await prisma.cryptoCredentials.findMany({
      where: { userId },
    });
    return creds.map((c) => ({
      ...c,
      ...decodeCredentials(
        c.apiKey,
        c.apiSecret,
        c.apiPassphrase,
        c.apiKeyVersion
      ),
    }));
  }
}
// Update specific credentials by ID
export async function updateCryptoCredentials(
  id: string,
  data: Partial<{
    exchange: CryptoExchange;
    apiKey: string;
    apiSecret: string;
    apiPassphrase?: string;
    apiKeyVersion?: string;
  }>
) {
  const existing = await prisma.cryptoCredentials.findUnique({ where: { id } });
  if (!existing) throw new Error("Credential not found");
  const decodedExisting = decodeCredentials(
    existing.apiKey,
    existing.apiSecret,
    existing.apiPassphrase,
    existing.apiKeyVersion
  );

  const encodedData: any = {};
  if (data.exchange && data.exchange !== existing.exchange) {
    // Delete conflicting credential if it exists
    await prisma.cryptoCredentials.deleteMany({
      where: {
        userId: existing.userId,
        exchange: data.exchange,
        NOT: { id },
      },
    });

    encodedData.exchange = data.exchange;
  }
  if (data.apiKey || data.apiSecret || data.apiPassphrase) {
    const encoded = encodeCredentials(
      data.apiKey ?? decodedExisting.apiKey,
      data.apiSecret ?? decodedExisting.apiSecret,
      data.apiPassphrase ?? decodedExisting.apiPassphrase,
      data.apiKeyVersion ?? existing.apiKeyVersion
    );

    Object.assign(encodedData, encoded);
  }
  const updated = await prisma.cryptoCredentials.update({
    where: { id },
    data: encodedData,
  });

  return {
    ...updated,
    ...decodeCredentials(
      updated.apiKey,
      updated.apiSecret,
      updated.apiPassphrase,
      updated.apiKeyVersion
    ),
  };
}
// Delete credentials by ID
export async function deleteCryptoCredentials(id: string) {
  return prisma.cryptoCredentials.delete({ where: { id } });
}
