import crypto from "crypto";

export function createQueryString(params: Record<string, any>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function generateSignatureBinance(
  queryString: string,
  apiSecret: string
): string {
  return crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");
}

export const handleBinanceError = (error: any) => {
  const exchangeMessage =
    error.response?.data?.msg ||
    error.response?.data?.message ||
    error.message ||
    "Unknown exchange error";

  if (error.response?.status === 401 || error.response?.status === 403) {
    throw { code: "AUTH_INVALID", message: exchangeMessage };
  }

  if (error.response?.status === 429) {
    throw { code: "RATE_LIMITED", message: exchangeMessage };
  }

  throw { code: "EXCHANGE_UNAVAILABLE", message: exchangeMessage };
};
