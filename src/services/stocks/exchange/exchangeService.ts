import { StocksExchange } from "@prisma/client";
import {
  createZerodhaOrder,
  getZerodhaBalances,
  getZerodhaLoginUrl,
  getZerodhaPositions,
  handleZerodhaAuthCallback,
  loginZerodha,
} from "./zerodhaService";
import {
  createAngelOneOrder,
  getAngelOneBalances,
  getAngelOnePositions,
  loginAngelOne,
} from "./angeloneService";
import { CommonOrderPayload } from "../../../utils/stocks/exchange/tradeUtils";
import { mapToZerodhaOrder } from "../../../utils/stocks/exchange/zerodhaUtils";
import { mapToAngelOneOrder } from "../../../utils/stocks/exchange/angeloneUtils";
type CredentialsInput = {
  apiKey: string;
  apiSecret?: string;
  requestToken?: string;
  clientCode?: string; // optional for Angel/Zerodha
  password?: string; // Angel One
  totp?: string; // Angel One
};

/**
 * STEP 1: Get Login URL (only for Zerodha)
 */
export function getStockLoginUrl(exchange: StocksExchange, apiKey: string) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return { loginUrl: getZerodhaLoginUrl(apiKey) };

    case StocksExchange.ANGELONE:
      throw {
        code: "NOT_REQUIRED",
        message: "Angel One does not require a login URL",
      };

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * STEP 2: Handle callback (Zerodha only)
 */
export function handleStockAuthCallback(exchange: StocksExchange, req: any) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return handleZerodhaAuthCallback(req);

    default:
      throw {
        code: "UNSUPPORTED_FLOW",
        message: "Callback not supported for this broker",
      };
  }
}

/**
 * STEP 3: Login / Generate Access Token
 */
export async function loginStockExchange(
  exchange: StocksExchange,
  params: any
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return loginZerodha(params);

    case StocksExchange.ANGELONE:
      return loginAngelOne(params);

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * Fetch balances (money + holdings)
 */
export async function getStockBalances(
  exchange: StocksExchange,
  credentials: any
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return getZerodhaBalances(credentials);

    case StocksExchange.ANGELONE:
      return getAngelOneBalances(credentials);

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * Place order
 */
export async function placeStockOrder(
  exchange: StocksExchange,
  credentials: any,
  payload: CommonOrderPayload
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return createZerodhaOrder(credentials, mapToZerodhaOrder(payload));

    case StocksExchange.ANGELONE:
      return createAngelOneOrder(
        credentials,
        await mapToAngelOneOrder(payload)
      );

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * Fetch positions
 */
export async function getStockPositions(
  exchange: StocksExchange,
  credentials: any
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return getZerodhaPositions(credentials);

    case StocksExchange.ANGELONE:
      return getAngelOnePositions(credentials);

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}
