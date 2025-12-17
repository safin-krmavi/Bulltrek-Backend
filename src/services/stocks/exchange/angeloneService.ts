import axios from "axios";
import { ANGEL_INSTRUMENTS_URL, ANGELONE_BASE_URL } from "../../../constants/stocks/externalUrls";
import { AngelOneOrderPayload, handleAngelOneError } from "../../../utils/stocks/exchange/angeloneUtils";
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
      if (item.instrumenttype === "FUTSTK" || item.instrumenttype === "FUTIDX") {
        futuresSymbols.push(item.symbol);
      }

      // Options
      if (item.instrumenttype === "OPTSTK" || item.instrumenttype === "OPTIDX") {
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
export async function loginAngelOne(params: {
  userId: string;
  apiKey: string;
  clientCode: string;
  password: string;
  totp: string;
}) {
  try {
    const response = await axios.post(
      `${ANGELONE_BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
      {
        clientcode: params.clientCode,
        password: params.password,
        totp: params.totp,
      },
      {
        headers: {
          "X-PrivateKey": params.apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const { jwtToken, refreshToken, feedToken } = response.data.data;

    await addOrUpdateStocksCredentials({
      userId: params.userId,
      exchange: StocksExchange.ANGELONE,
      apiKey: params.apiKey,
      clientCode: params.clientCode,
      accessToken: jwtToken,
      refreshToken,
      feedToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return { success: true };
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
