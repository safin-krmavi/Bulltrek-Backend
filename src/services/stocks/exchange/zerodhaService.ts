import axios from "axios";
import crypto from "crypto";

import {
  ZERODHA_BASE_URL,
  ZERODHA_LOGIN_URL,
} from "../../../constants/stocks/externalUrls";
import {
  endOfDay,
  handleZerodhaError,
  ZerodhaOrderPayload,
} from "../../../utils/stocks/exchange/zerodhaUtils";
import { StocksExchange, TradeSide } from "@prisma/client";
import prisma from "../../../config/db.config";
import { addOrUpdateStocksCredentials } from "../credentialsService";

/**
 * STEP 1: Generate Zerodha Login URL
 */
export function getZerodhaLoginUrl(apiKey: string) {
  return `${ZERODHA_LOGIN_URL}?v=3&api_key=${apiKey}`;
}

export function handleZerodhaAuthCallback(req: any) {
  const { request_token, status } = req.query as {
    request_token?: string;
    status?: string;
  };

  if (status !== "success") {
    throw {
      code: "AUTH_FAILED",
      message: "Zerodha login was not successful",
    };
  }

  if (!request_token) {
    throw {
      code: "AUTH_FAILED",
      message: "Request token not found in callback",
    };
  }

  return {
    requestToken: request_token,
  };
}

/**
 * STEP 2: Exchange request_token → access_token
 * Store access token in DB (valid for the trading day)
 */
export async function loginZerodha(params: {
  userId: string;
  apiKey: string;
  apiSecret: string;
  requestToken: string;
}) {
  try {
    const checksum = crypto
      .createHash("sha256")
      .update(`${params.apiKey}${params.requestToken}${params.apiSecret}`)
      .digest("hex");

    const response = await axios.post(`${ZERODHA_BASE_URL}/session/token`, {
      api_key: params.apiKey,
      request_token: params.requestToken,
      checksum,
    });

    const { access_token, user_id } = response.data.data;

    await addOrUpdateStocksCredentials({
      userId: params.userId,
      exchange: StocksExchange.ZERODHA,
      apiKey: params.apiKey,
      clientCode: user_id,
      accessToken: access_token,
      expiresAt: endOfDay(),
    });

    return { success: true };
  } catch (error: any) {
    handleZerodhaError(error);
  }
}

export async function getZerodhaBalances(credentials: {
  apiKey: string;
  accessToken: string;
}) {
  try {
    const headers = {
      "X-Kite-Version": "3",
      Authorization: `token ${credentials.apiKey}:${credentials.accessToken}`,
    };

    const [marginsRes, holdingsRes] = await Promise.all([
      axios.get(`${ZERODHA_BASE_URL}/user/margins`, { headers }),
      axios.get(`${ZERODHA_BASE_URL}/portfolio/holdings`, { headers }),
    ]);

    return {
      money: marginsRes.data, // funds, margin, collateral
      stocks: holdingsRes.data, // CNC holdings
    };
  } catch (error: any) {
    handleZerodhaError(error);
  }
}

export async function createZerodhaOrder(
  credentials: {
    apiKey: string;
    accessToken: string;
  },
  payload: ZerodhaOrderPayload
) {
  try {
    const variety = payload.variety ?? "regular";

    const response = await axios.post(
      `${ZERODHA_BASE_URL}/orders/${variety}`,
      payload,
      {
        headers: {
          "X-Kite-Version": "3",
          Authorization: `token ${credentials.apiKey}:${credentials.accessToken}`,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    handleZerodhaError(error);
  }
}

export async function getZerodhaPositions(credentials: {
  apiKey: string;
  accessToken: string;
}) {
  try {
    const response = await axios.get(
      `${ZERODHA_BASE_URL}/portfolio/positions`,
      {
        headers: {
          "X-Kite-Version": "3",
          Authorization: `token ${credentials.apiKey}:${credentials.accessToken}`,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    handleZerodhaError(error);
  }
}
