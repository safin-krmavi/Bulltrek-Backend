import { CryptoTradeType, StocksExchange, TradeSide } from "@prisma/client";
import {
  createZerodhaOrder,
  getZerodhaBalances,
  getZerodhaLoginUrl,
  getZerodhaPositions,
  handleZerodhaAuthCallback,
  loginZerodha,
} from "../exchange/zerodhaService";
import {
  createAngelOneOrder,
  getAngelOneBalances,
  getAngelOneLoginUrl,
  getAngelOnePositions,
  handleAngelOneCallback,
} from "./angeloneService";
import { CommonOrderPayload } from "../../../utils/stocks/exchange/tradeUtils";
import { mapToZerodhaOrder } from "../../../utils/stocks/exchange/zerodhaUtils";
import { mapToAngelOneOrder } from "../../../utils/stocks/exchange/angeloneUtils";
import {
  createKotakNeoOrder,
  getKotakNeoHoldings,
  getKotakNeoOrders,
  kotakNeoTotpLogin,
  kotakNeoValidateMpin,
} from "./kotakService";

/**
 * STEP 1: Get Login URL (only for Zerodha)
 */
export function getStockLoginUrl(exchange: StocksExchange, userId: string) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      return { loginUrl: getZerodhaLoginUrl() };

    case StocksExchange.ANGELONE:
      return {
        loginUrl: getAngelOneLoginUrl(userId),
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
    case StocksExchange.ANGELONE:
      return handleAngelOneCallback(req);

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

    case StocksExchange.KOTAK: {
      console.log("[KOTAK] Login flow started", {
        userId: params.userId,
        ucc: params.clientCode,
      });

      const { viewToken, viewSid } = await kotakNeoTotpLogin({
        accessToken: params.accessToken,
        mobileNumber: params.mobileNumber,
        ucc: params.clientCode,
        totp: params.totp,
      });

      console.log("[KOTAK] TOTP login successful", {
        userId: params.userId,
        viewSidPresent: Boolean(viewSid),
      });

      const result = await kotakNeoValidateMpin({
        userId: params.userId,
        clientCode: params.clientCode,
        accessToken: params.accessToken,
        viewToken,
        viewSid,
        mpin: params.mpin,
      });

      console.log("[KOTAK] MPIN validation completed", {
        userId: params.userId,
      });

      return result;
    }

    case StocksExchange.ANGELONE:
      throw {
        code: "NOT_REQUIRED",
        message: "Unsupported broker",
      };

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}

/**
 * Verify API keys by making a lightweight authenticated call
 */
export async function verifyStockCredentials(
  exchange: StocksExchange,
  credentials: any
) {
  switch (exchange) {
    case StocksExchange.ZERODHA:
      // balances is the safest validation
      await getZerodhaBalances(credentials);
      return { verified: true };

    case StocksExchange.ANGELONE:
      await getAngelOneBalances(credentials);
      return { verified: true };
    case StocksExchange.KOTAK:
      const data = await getKotakNeoHoldings({
        baseUrl: credentials.feedToken,
        tradingToken: credentials.accessToken,
        tradingSid: credentials.refreshToken,
      });
      console.log("DATA", data);
      return { verified: true };

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

    case StocksExchange.KOTAK:
      return getKotakNeoHoldings({
        baseUrl: credentials.feedToken,
        tradingToken: credentials.accessToken,
        tradingSid: credentials.refreshToken,
      });

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

    case StocksExchange.KOTAK:
      return createKotakNeoOrder({
        baseUrl: credentials.feedToken,
        tradingToken: credentials.accessToken,
        tradingSid: credentials.refreshToken,
        symbol: payload.symbol,
        quantity: payload.quantity,
        side: payload.side === TradeSide.BUY ? "B" : "S",
        orderType:
          payload.orderType === "MARKET"
            ? "MKT"
            : payload.orderType === "LIMIT"
            ? "L"
            : payload.orderType === "SL"
            ? "SL"
            : "SL-M",
        price: payload.price,
      });

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

    case StocksExchange.KOTAK:
      return getKotakNeoOrders({
        baseUrl: credentials.feedToken,
        tradingToken: credentials.accessToken,
        tradingSid: credentials.refreshToken,
      });

    default:
      throw {
        code: "UNSUPPORTED_BROKER",
        message: "Unsupported broker",
      };
  }
}
