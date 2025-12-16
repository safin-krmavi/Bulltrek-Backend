import axios from "axios";
import crypto from "crypto";

import {
  ANGELONE_BASE_URL,
  ANGELONE_LOGIN_URL,
} from "../../../constants/stocks/externalUrls";
import { handleAngelOneError } from "../../../utils/stocks/exchange/angeloneUtils";

/**
 * Returns the login URL for Angel One
 */
export function getAngelOneLoginUrl(credentials: { apiKey: string }) {
  return {
    loginUrl: `${ANGELONE_LOGIN_URL}?api_key=${credentials.apiKey}`,
  };
}

/**
 * Handles the Angel One auth callback
 */
export function handleAngelOneAuthCallback(req: any) {
  const { request_token, status } = req.query as {
    request_token?: string;
    status?: string;
  };

  if (status !== "success") {
    throw {
      code: "AUTH_FAILED",
      message: "Angel One login was not successful",
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
 * Generates access token from Angel One request token
 */
export async function generateAngelOneAccessToken(credentials: {
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

    const response = await axios.post(`${ANGELONE_BASE_URL}/session/token`, {
      api_key: credentials.apiKey,
      request_token: credentials.requestToken,
      checksum,
    });

    return response.data;
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
    const response = await axios.get(
      `${ANGELONE_BASE_URL}/portfolio/holdings`,
      {
        headers: {
          "X-Angel-One-Version": "1",
          Authorization: `token ${credentials.apiKey}:${credentials.accessToken}`,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    handleAngelOneError(error);
  }
}
