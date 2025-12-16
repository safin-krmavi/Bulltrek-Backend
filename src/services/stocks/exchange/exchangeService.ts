import {
  generateZerodhaAccessToken,
  getZerodhaBalances,
  getZerodhaLoginUrl,
  handleZerodhaAuthCallback,
} from "./zerodhaService";

export async function getStockLoginUrl(
  broker: string,
  credentials: { apiKey: string }
) {
  switch (broker) {
    case "ZERODHA":
      return getZerodhaLoginUrl(credentials);

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported stock broker",
      };
  }
}

export async function handleStockAuthCallback(req: Request) {
  // Route-based dispatch
  // In future you can add /upstox/callback, /fyers/callback etc.
  return handleZerodhaAuthCallback(req);
}
export async function generateStockAccessToken(
  broker: string,
  credentials: any
) {
  switch (broker) {
    case "ZERODHA":
      return generateZerodhaAccessToken(credentials);

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported stock broker",
      };
  }
}

export async function getStockBalances(broker: string, credentials: any) {
  switch (broker) {
    case "ZERODHA":
      return getZerodhaBalances(credentials);

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported stock broker",
      };
  }
}
