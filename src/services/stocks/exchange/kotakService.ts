import axios from "axios";
import fs from "fs/promises";
import path from "path";

import csv from "csv-parser";
import { Readable } from "stream";

import { KOTAK_NEO_LOGIN_BASE } from "../../../constants/stocks/externalUrls";
import {
  addOrUpdateStocksCredentials,
  getStocksCredentials,
} from "../credentialsService";
import { StocksExchange } from "@prisma/client";
import { handleKotakError } from "../../../utils/stocks/exchange/kotakUtils";
import { kotakHttpsAgent } from "../../../utils/stocks/exchange/kotakHttp";
import prisma from "../../../config/db.config";
import { STOCKS_FILE_PATH } from "../../../constants/stocks";

/**
 * Fetch all Kotak symbols (NSE CM)
 * userId is mandatory
 */
export async function fetchAndStoreKotakSymbols(): Promise<
  Record<string, any>
> {
  try {
    const adminUser = await prisma.stocksUser.findFirst({
      where: {
        role: {
          name: "ADMIN_STOCKS",
        },
      },
      select: {
        id: true,
      },
    });

    if (!adminUser) {
      throw new Error("No ADMIN stocks user found");
    }

    // 1. Fetch credentials
    const creds = await getStocksCredentials(
      adminUser.id,
      StocksExchange.KOTAK
    );

    if (!creds || Array.isArray(creds)) {
      throw new Error("Invalid Kotak credentials");
    }

    if (creds.isExpired) {
      throw new Error("Kotak access token expired");
    }

    // 2. Fetch scrip master file paths
    const { data } = await axios.get(
      `${creds.feedToken}/script-details/1.0/masterscrip/file-paths`,
      {
        headers: {
          Authorization: creds.apiKey,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const fileUrls: string[] = data?.data?.filesPaths ?? [];

    if (!fileUrls.length) {
      throw new Error("No scripmaster files returned by Kotak");
    }

    const symbolMap: Record<string, any> = {};

    // 3. Iterate ALL CSV files
    for (const fileUrl of fileUrls) {
      const response = await axios.get(fileUrl, {
        responseType: "stream",
        timeout: 30_000,
      });

      await new Promise<void>((resolve, reject) => {
        Readable.from(response.data)
          .pipe(csv())
          .on("data", (row) => {
            if (!row.pExchSeg || !row.pSymbol) return;

            const key = `${row.pExchSeg}|${row.pSymbol}`;

            symbolMap[key] = {
              exchangeSegment: row.pExchSeg, // nse_cm, bse_cm, nse_fo, etc.
              pSymbol: row.pSymbol,
              tradingSymbol: row.pTrdSymbol ?? null,
              lotSize: row.lLotSize ? Number(row.lLotSize) : undefined,
              expiry: row.lExpiryDate ? Number(row.lExpiryDate) : undefined,
            };
          })
          .on("end", resolve)
          .on("error", reject);
      });
    }

    console.log(
      `[Kotak] Stored ${
        Object.keys(symbolMap).length
      } total symbols (ALL segments)`
    );

    return symbolMap;
  } catch (error: any) {
    console.error("[Kotak ScripMaster Error]", {
      message: error?.message,
      stack: error?.stack,
    });

    throw new Error(
      error?.message || "Failed to fetch and store Kotak symbols"
    );
  }
}

export async function fetchKotakSymbolsFromFile() {
  try {
    const data = await fs.readFile(STOCKS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(data);

    const kotakBlock = parsed
      ?.find((b: any) => b.type === "STOCKS")
      ?.data?.find((e: any) => e.exchange === "KOTAK");

    return kotakBlock?.data ?? [];
  } catch (error) {
    console.error("[KOTAK][SYMBOL_FILE_READ] Failed", error);
    throw new Error("Failed to read Kotak symbols from file");
  }
}

export async function getKotakSymbol(params: {
  tradingSymbol?: string;
  pSymbol?: string;
  exchangeSegment?: string;
}) {
  const symbols = await fetchKotakSymbolsFromFile();

  return (
    symbols.find((s: any) => {
      if (
        params.exchangeSegment &&
        s.exchangeSegment !== params.exchangeSegment
      )
        return false;

      if (params.tradingSymbol && s.tradingSymbol === params.tradingSymbol)
        return true;

      if (params.pSymbol && s.pSymbol === params.pSymbol) return true;

      return false;
    }) ?? null
  );
}

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
  orderType?: string;
  price?: number; // required for LIMIT
}) {
  try {
    const isMarket = (params.orderType ?? "MARKET") === "MKT";

    if (!isMarket && !params.price) {
      throw new Error("Price is required for LIMIT orders");
    }

    const jData: Record<string, string> = {
      am: "NO",
      dq: "0",
      es: "nse_cm",
      pc: "CNC",
      pf: "N",
      tt: params.side ?? "B",
      qt: String(params.quantity),
      rt: "DAY",
      tp: "0",
      ts: params.symbol,
    };

    if (isMarket) {
      jData.pt = "MKT";
      jData.pr = "0";
      jData.mp = "0";
    } else {
      jData.pt = "L";
      jData.pr = params.price!.toString();
      jData.mp = "0";
    }

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
    console.log(params);
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

export async function fetchKotakMarketPrice(params: {
  userId: string;
  symbol: string; // neosymbol
}) {
  const { userId, symbol } = params;
  const kotakSymbol = await getKotakSymbol({
    tradingSymbol: symbol,
  });

  if (!kotakSymbol) {
    throw new Error(`Kotak symbol not found: ${symbol}`);
  }

  const { exchangeSegment, pSymbol } = kotakSymbol;

  try {
    const rawCredentials = await getStocksCredentials(
      userId,
      StocksExchange.KOTAK
    );
    const credentials = Array.isArray(rawCredentials)
      ? rawCredentials[0]
      : rawCredentials;

    if (!credentials) {
      throw new Error("Credentiala not found");
    }

    if (!symbol) {
      throw new Error("Symbol must be provided");
    }
    const fetchLtp = async (key: string) => {
      const res = await axios.get(
        `${credentials.feedToken}/script-details/1.0/quotes/neosymbol/${key}/ltp`,
        {
          httpsAgent: kotakHttpsAgent,
          headers: {
            Authorization: credentials.apiKey,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      if (
        res?.data?.fault?.message.includes("Invalid neosymbol values") &&
        pSymbol
      ) {
        const fallbackKey = `${exchangeSegment}|${pSymbol}`;
        return await fetchLtp(fallbackKey);
      }
      const quote = res.data?.[0];
      console.log("QUOTE:", res?.data);
      if (!quote?.ltp) {
        throw new Error(`LTP not available for ${key}`);
      }

      return Number(quote.ltp);
    };
    const primaryKey = `${exchangeSegment}|${symbol}`;

    try {
      return await fetchLtp(primaryKey);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || "";
      console.log(error);
      // fallback ONLY for invalid neosymbol
      if (message.includes("Invalid neosymbol values") && pSymbol) {
        const fallbackKey = `${exchangeSegment}|${pSymbol}`;
        return await fetchLtp(fallbackKey);
      }

      throw error;
    }
  } catch (error: any) {
    console.error("[KOTAK][MARKET_PRICE] Failed", {
      symbol,
      pSymbol,
      exchangeSegment,
      error: error?.response?.data || error.message,
    });

    handleKotakError(error);
  }
}
