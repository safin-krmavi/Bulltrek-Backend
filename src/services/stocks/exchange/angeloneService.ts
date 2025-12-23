import axios from "axios";
import {
  ANGEL_INSTRUMENTS_URL,
  ANGELONE_BASE_URL,
} from "../../../constants/stocks/externalUrls";
import {
  AngelOneOrderPayload,
  handleAngelOneError,
} from "../../../utils/stocks/exchange/angeloneUtils";
import { StocksExchange } from "@prisma/client";
import { addOrUpdateStocksCredentials } from "../credentialsService";

export async function getAngelOneInstruments() {
  try {
    const response = await axios.get(ANGEL_INSTRUMENTS_URL, {
      timeout: 15000,
    });

    const instruments = response.data;

    if (!Array.isArray(instruments)) {
      throw new Error("Invalid Angel One instruments format");
    }

    const equitySymbols: string[] = [];
    const futuresSymbols: string[] = [];
    const optionsSymbols: string[] = [];

    for (const item of instruments) {
      // Equity (NSE Cash)
      if (item.exch_seg === "NSE" && item.instrumenttype === "EQ") {
        equitySymbols.push(item.symbol);
      }

      // Futures
      if (
        item.instrumenttype === "FUTSTK" ||
        item.instrumenttype === "FUTIDX"
      ) {
        futuresSymbols.push(item.symbol);
      }

      // Options
      if (
        item.instrumenttype === "OPTSTK" ||
        item.instrumenttype === "OPTIDX"
      ) {
        optionsSymbols.push(item.symbol);
      }
    }

    return {
      equitySymbols,
      futuresSymbols,
      optionsSymbols,
      rawCount: instruments.length,
    };
  } catch (error: any) {
    throw {
      code: "EXCHANGE_UNAVAILABLE",
      message: "Failed to fetch Angel One instruments",
      raw: error?.message || error,
    };
  }
}

/**
 * Returns the Angel One publisher login URL
 * User should be redirected to this URL in their browser
 */
export function getAngelOneLoginUrl(userId: string) {
  const apiKey = process.env.ANGELONE_API_KEY;

  return `https://smartapi.angelone.in/publisher-login?api_key=${apiKey}&state=${userId}`;
}

/**
 * After user logs in via browser, Angel One redirects to your callback URL with tokens
 * Extract auth_token, feed_token, and refresh_token from query params and call this
 */

// ============================================================================
// Handle Callback - Exchange auth_token for JWT
// ============================================================================
export async function handleAngelOneCallback(req: any) {
  try {
    const {
      auth_token,
      refresh_token,
      feed_token,
      state, // userId
    } = req.query;

    const apiKey = process.env.ANGELONE_API_KEY;
    if (!apiKey) {
      throw new Error("ANGELONE_API_KEY not found");
    }

    if (!auth_token || !refresh_token || !feed_token) {
      throw new Error("Missing required tokens from Angel One callback");
    }

    if (!state) {
      throw new Error("Missing state (userId) from callback");
    }

    console.log("📥 Received tokens from callback");

    console.log("Auth Token (first 50 chars):", auth_token.substring(0, 50));

    // ✅ CRITICAL: Exchange the auth_token for a proper JWT token
    // The auth_token from callback is NOT usable directly - you must exchange it
    const jwtRes = await axios.post(
      `${ANGELONE_BASE_URL}/rest/auth/angelbroking/jwt/v1/generateTokens`,
      {
        refreshToken: refresh_token, // Use the refresh_token from callback
      },
      {
        headers: {
          Authorization: `Bearer ${auth_token}`, // Use auth_token in header
          "X-PrivateKey": apiKey,
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("✅ JWT Generation Response:", jwtRes.data);

    const {
      jwtToken,
      refreshToken: newRefreshToken,
      feedToken: newFeedToken,
    } = jwtRes.data.data;

    // Store the NEW JWT token (not the original auth_token)
    await addOrUpdateStocksCredentials({
      userId: state,
      exchange: StocksExchange.ANGELONE,
      apiKey,
      clientCode: "",
      accessToken: jwtToken, // ✅ This is the REAL JWT for API calls
      refreshToken: newRefreshToken, // ✅ New refresh token
      feedToken: newFeedToken, // ✅ New feed token
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    console.log("✅ Credentials stored successfully");

    return {
      success: true,
      message: "Angel One connected successfully",
    };
  } catch (error: any) {
    console.error("❌ Callback Error:", error.response?.data || error.message);
    throw {
      code: "ANGELONE_CALLBACK_ERROR",
      message:
        error?.response?.data?.message ||
        error?.message ||
        "Angel One callback failed",
      raw: error.response?.data || error,
    };
  }
}

/**
 * Use this to refresh the access token when it expires (after 24 hours)
 */
export async function refreshAngelOneToken(params: {
  userId: string;
  refreshToken: string;
}) {
  try {
    const apiKey = process.env.ANGELONE_API_KEY;

    const response = await axios.post(
      `${ANGELONE_BASE_URL}/rest/auth/angelbroking/jwt/v1/generateTokens`,
      {
        refreshToken: params.refreshToken,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-PrivateKey": apiKey,
        },
        timeout: 10000,
      }
    );

    const { jwtToken, refreshToken, feedToken } = response.data.data;

    // Update stored credentials
    await addOrUpdateStocksCredentials({
      userId: params.userId,
      exchange: StocksExchange.ANGELONE,
      apiKey,
      clientCode: "",
      accessToken: jwtToken,
      refreshToken,
      feedToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return { success: true, jwtToken, feedToken };
  } catch (error: any) {
    handleAngelOneError(error);
  }
}

/**
 * Fetches Angel One holdings/balances
 */
export async function getAngelOneBalances(credentials: {
  apiKey: string;
  accessToken: string;
}) {
  try {
    const headers = {
      Authorization: `Bearer ${credentials.accessToken}`,
      "X-PrivateKey": credentials.apiKey,
      Accept: "application/json",
    };

    const [moneyRes, stocksRes] = await Promise.all([
      axios.get(`${ANGELONE_BASE_URL}/rest/user/v1/getRMS`, { headers }),
      axios.get(`${ANGELONE_BASE_URL}/rest/portfolio/v1/getHolding`, {
        headers,
      }),
    ]);
    console.log(moneyRes);

    return {
      money: moneyRes.data, // margin, available cash
      stocks: stocksRes.data, // holdings
    };
  } catch (error: any) {
    handleAngelOneError(error);
  }
}

export async function createAngelOneOrder(
  credentials: {
    apiKey: string;
    accessToken: string;
  },
  payload: AngelOneOrderPayload
) {
  try {
    const response = await axios.post(
      `${ANGELONE_BASE_URL}/rest/order/v1/placeOrder`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "X-PrivateKey": credentials.apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error: any) {
    handleAngelOneError(error);
  }
}
export async function getAngelOnePositions(credentials: {
  apiKey: string;
  accessToken: string;
}) {
  try {
    const response = await axios.get(
      `${ANGELONE_BASE_URL}/rest/portfolio/v1/getPosition`,
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "X-PrivateKey": credentials.apiKey,
          Accept: "application/json",
        },
      }
    );

    return response.data;
  } catch (error: any) {
    handleAngelOneError(error);
  }
}
