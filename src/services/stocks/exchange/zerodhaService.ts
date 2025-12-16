import axios from "axios";
import crypto from "crypto";

import {
  ZERODHA_BASE_URL,
  ZERODHA_LOGIN_URL,
} from "../../../constants/stocks/externalUrls";
import { handleZerodhaError } from "../../../utils/stocks/exchange/zerodhaUtils";

export function getZerodhaLoginUrl(credentials: { apiKey: string }) {
  return {
    loginUrl: `${ZERODHA_LOGIN_URL}?v=3&api_key=${credentials.apiKey}`,
  };
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

export async function generateZerodhaAccessToken(credentials: {
  apiKey: string;
  apiSecret: string;
  requestToken: string;
}) {
  try {
    const checksum = crypto
      .createHash("sha256")
      .update(
        `${credentials.apiKey}${credentials.requestToken}${credentials.apiSecret}`
      )
      .digest("hex");

    const response = await axios.post(`${ZERODHA_BASE_URL}/session/token`, {
      api_key: credentials.apiKey,
      request_token: credentials.requestToken,
      checksum,
    });

    return response.data;
  } catch (error: any) {
    handleZerodhaError(error);
  }
}

export async function getZerodhaBalances(credentials: {
  apiKey: string;
  accessToken: string;
}) {
  try {
    const response = await axios.get(`${ZERODHA_BASE_URL}/portfolio/holdings`, {
      headers: {
        "X-Kite-Version": "3",
        Authorization: `token ${credentials.apiKey}:${credentials.accessToken}`,
      },
    });

    return response.data;
  } catch (error: any) {
    handleZerodhaError(error);
  }
}
