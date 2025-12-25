import axios from "axios";
import { KOTAK_NEO_LOGIN_BASE } from "../../../constants/stocks/externalUrls";
import { addOrUpdateStocksCredentials } from "../credentialsService";
import { StocksExchange } from "@prisma/client";
import { handleKotakError } from "../../../utils/stocks/exchange/kotakUtils";
import { kotakHttpsAgent } from "../../../utils/stocks/exchange/kotakHttp";

export async function kotakNeoTotpLogin(params: {
  accessToken: string;
  mobileNumber: string;
  ucc: string;
  totp: string;
}) {
  try {
    console.log("[KOTAK][TOTP] Preparing request", {
      url: `${KOTAK_NEO_LOGIN_BASE}/login/1.0/tradeApiLogin`,
      headers: {
        AuthorizationPresent: Boolean(params.accessToken),
        "neo-fin-key": "neotradeapi",
        "Content-Type": "application/json",
      },
      body: {
        mobileNumber: params.mobileNumber,
        ucc: params.ucc,
        totpPresent: params.totp,
      },
    });

    const res = await axios.post(
      `${KOTAK_NEO_LOGIN_BASE}/login/1.0/tradeApiLogin`,
      {
        mobileNumber: params.mobileNumber,
        ucc: params.ucc,
        totp: params.totp,
      },
      {
        httpsAgent: kotakHttpsAgent,
        headers: {
          Authorization: params.accessToken,
          "neo-fin-key": "neotradeapi",
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[KOTAK][TOTP] Raw response received", {
      statusCode: res.status,
    });

    const { token, sid, status } = res.data.data;

    console.log("[KOTAK][TOTP] Parsed response", {
      status,
      sidPresent: Boolean(sid),
    });

    if (status !== "success") {
      console.error("[KOTAK][TOTP] Login failed", res);
      throw new Error("TOTP login failed");
    }

    return {
      viewToken: token,
      viewSid: sid,
    };
  } catch (error: any) {
    console.error("[KOTAK][TOTP] LOGIN_FAILED", {
      error: error?.response?.data?.error[0]?.message || error?.response,
    });
    handleKotakError(error);
  }
}

export async function kotakNeoValidateMpin(params: {
  userId: string;
  clientCode: string;
  accessToken: string;
  viewToken: string;
  viewSid: string;
  mpin: string;
}) {
  try {
    console.log("[KOTAK][MPIN] Preparing validation request", {
      userId: params.userId,
      url: `${KOTAK_NEO_LOGIN_BASE}/login/1.0/tradeApiValidate`,

      headers: {
        AuthorizationPresent: Boolean(params.accessToken),
        SidPresent: Boolean(params.viewSid),
        AuthPresent: Boolean(params.viewToken),
        "neo-fin-key": "neotradeapi",
        "Content-Type": "application/json",
      },
      body: {
        mpinPresent: Boolean(params.mpin),
      },
    });

    const res = await axios.post(
      `${KOTAK_NEO_LOGIN_BASE}/login/1.0/tradeApiValidate`,
      { mpin: params.mpin },
      {
        httpsAgent: kotakHttpsAgent,

        headers: {
          Authorization: params.accessToken,
          "neo-fin-key": "neotradeapi",
          Sid: params.viewSid,
          Auth: params.viewToken,
          "Content-Type": "application/json",
        },
        // timeout: 10000,
      }
    );

    console.log("[KOTAK][MPIN] Raw response received", {
      statusCode: res.status,
    });
    console.log(res.data);
    console.log(res.data.data);
    const { token, sid, baseUrl, status } = res.data.data;

    console.log("[KOTAK][MPIN] Parsed response", {
      status,
      tradingSidPresent: Boolean(sid),
    });

    if (status !== "success") {
      console.error("[KOTAK][MPIN] Validation failed", res.data);
      throw new Error("MPIN validation failed");
    }

    console.log("[KOTAK][MPIN] Storing credentials", {
      userId: params.userId,
      exchange: StocksExchange.KOTAK,
    });

    await addOrUpdateStocksCredentials({
      userId: params.userId,
      exchange: StocksExchange.KOTAK,
      accessToken: token,
      clientCode: params.clientCode,
      apiKey: params.accessToken,
      refreshToken: sid,
      feedToken: baseUrl,
      expiresAt: new Date(new Date().setHours(23, 59, 59, 999)),
    });

    console.log("[KOTAK][MPIN] Credentials stored successfully", {
      userId: params.userId,
    });

    return {
      tradingToken: token,
      tradingSid: sid,
      baseUrl,
    };
  } catch (error: any) {
    console.error("[KOTAK][MPIN] VALIDATION_FAILED", {
      userId: params.userId,
      error: error?.response?.data?.error[0]?.message || error?.response,
    });
    handleKotakError(error);
  }
}

export async function createKotakNeoOrder(params: {
  baseUrl: string;
  tradingToken: string;
  tradingSid: string;
  symbol: string; // e.g. ITBEES-EQ
  quantity: number;
  side?: "B" | "S";
  orderType?: "MKT" | "LMT";
}) {
  try {
    const jData = {
      am: "NO",
      dq: "0",
      es: "nse_cm",
      mp: "0",
      pc: "CNC",
      pf: "N",
      pr: "0",
      tt: params.side ?? "B",
      pt: params.orderType ?? "MKT",

      qt: String(params.quantity),
      rt: "DAY",
      tp: "0",
      ts: params.symbol,
    };

    const body = new URLSearchParams({
      jData: JSON.stringify(jData),
    });

    const res = await axios.post(
      `${params.baseUrl}/quick/order/rule/ms/place`,
      body.toString(),
      {
        httpsAgent: kotakHttpsAgent,

        headers: {
          Auth: params.tradingToken,
          Sid: params.tradingSid,
          "neo-fin-key": "neotradeapi",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000,
      }
    );

    return res.data;
  } catch (error: any) {
    console.error("❌ KOTAK_ORDER_FAILED", {
      error: error?.response?.data?.error[0]?.message || error?.response,
    });
    handleKotakError(error);
  }
}

export async function getKotakNeoHoldings(params: {
  baseUrl: string;
  tradingToken: string;
  tradingSid: string;
}) {
  try {

    console.log(params)
    const res = await axios.get(`${params.baseUrl}/portfolio/v1/holdings`, {
      httpsAgent: kotakHttpsAgent,
      headers: {
        Auth: params.tradingToken,
        Sid: params.tradingSid,
        "neo-fin-key": "neotradeapi",
      },
    });

    return res.data;
  } catch (error: any) {
    const statusCode = error?.response?.data?.error[0]?.code;
    const message =
      error?.response?.data?.error?.[0]?.message ||
      error?.response?.data?.message ||
      "";

    console.error("❌ KOTAK_GET_HOLDINGS_FAILED", {
      error: error?.response?.data?.error[0]?.message || error?.response,
    });

    if (
      statusCode === 424 &&
      message.toLowerCase().includes("no holdings found")
    ) {
      return {
        success: true,
        data: [],
        message: "No holdings found for this client",
      };
    }
    handleKotakError(error);
  }
}

export async function getKotakNeoOrders(params: {
  baseUrl: string;
  tradingToken: string;
  tradingSid: string;
}) {
  try {
    const res = await axios.get(`${params.baseUrl}/quick/user/orders`, {
      httpsAgent: kotakHttpsAgent,

      headers: {
        Auth: params.tradingToken,
        Sid: params.tradingSid,
        "neo-fin-key": "neotradeapi",
      },
    });

    return res.data;
  } catch (error: any) {
    console.error("❌ KOTAK_GET_ORDERS_FAILED", {
      error: error?.response?.data?.error[0]?.message || error?.response,
    });
    handleKotakError(error);
  }
}
