import axios from "axios";
import {
  KUCOIN_FUTURE_BALANCE_ENDPOINT,
  KUCOIN_FUTURE_GET_POSITIONS_ENDPOINT,
  KUCOIN_FUTURES_BASE_URL,
  KUCOIN_FUTURES_URL,
  KUCOIN_SPOT_BALANCE_ENDPOINT,
  KUCOIN_SPOT_BASE_URL,
  KUCOIN_SPOT_CREATE_ORDER_ENDPOINT,
  KUCOIN_SPOT_URL,
  KUCOIN_VERIFY_API_KEY_ENDPOINT,
} from "../../../constants/crypto/externalUrls";
import {
  generateHeadersKucoin,
  handleKucoinError,
} from "../../../utils/crypto/exchange/kucoinUtils";
import { TradeSide } from "@prisma/client";
import {
  getSymbolData,
  KucoinConfig,
  KucoinFuturesOrderParams,
  KucoinSpotOrderParams,
} from "../../../constants/crypto/exchange/kucoin";
import { formatSymbols } from "../../../utils/crypto/format";

// --------------------UTILITIES------------------------
// SCRAPE SYMBOLS
export const getKucoinAllData = async () => {
  try {
    const [spotRes, futuresRes] = await Promise.all([
      axios.get(KUCOIN_SPOT_URL),
      axios.get(KUCOIN_FUTURES_URL),
    ]);

    const spotData = spotRes.data?.data ?? [];
    const futuresData = futuresRes.data?.data ?? [];

    const spotSymbols = formatSymbols({
      data: spotData,
      keys: {
        symbol: "symbol",
        base: "baseCurrency",
        quote: "quoteCurrency",
      },
    });

    const futureSymbols = formatSymbols({
      data: futuresData,
      keys: {
        symbol: "symbol",
        base: "baseCurrency",
        quote: "quoteCurrency",
      },
    });

    return {
      exchange: "KUCOIN",
      spotSymbols,
      futureSymbols,
    };
  } catch (error) {
    // logger.error("ERROR_FETCHING_KUCOIN_DATA", { error });
    handleKucoinError(error);
  }
};

export async function verifyKucoinCredentials(config: KucoinConfig) {
  if (!config.apiPassphrase || !config.apiKeyVersion) {
    throw {
      code: "AUTH_INVALID",
      message: "Passphrase and API key version are required",
    };
  }

  const headers = await generateHeadersKucoin(
    config,
    "GET",
    KUCOIN_VERIFY_API_KEY_ENDPOINT
  );

  try {
    const response = await axios.get(
      `${KUCOIN_SPOT_BASE_URL}${KUCOIN_VERIFY_API_KEY_ENDPOINT}`,
      { headers }
    );

    return response.data;
  } catch (error: any) {
    handleKucoinError(error);
  }
}

// -----------------------SPOT---------------------------

export async function getKucoinSpotBalances(config: KucoinConfig) {
  const method = "GET";
  const headers = await generateHeadersKucoin(
    config,
    method,
    KUCOIN_SPOT_BALANCE_ENDPOINT,
    "",
    "spot"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_SPOT_BASE_URL}${KUCOIN_SPOT_BALANCE_ENDPOINT}`,
      { headers }
    );
    const spotBalances = response.data?.data || [];

    const filteredBalances = spotBalances
      .filter((item: any) => item.type == "trade")
      .map((item: any) => {
        const currency = item.currency || "";
        return {
          currency,
          balance: parseFloat(item.available || "0"),
          locked_balance: parseFloat(item.holds || "0"),
        };
      });

    return filteredBalances;
  } catch (error: any) {
    handleKucoinError(error);
  }
}

export async function createKucoinSpotTrade(
  credentials: KucoinConfig,
  payload: KucoinSpotOrderParams
) {
  const method = "POST";
  const orderData: any = {
    clientOid: Date.now().toString(),
    symbol: payload.symbol,
    type: payload.orderType.toLowerCase(), // "limit" or "market"
    side: payload.side.toLowerCase(),
    size: payload.quantity,
  };

  if (payload.orderType === "LIMIT" && payload.price) {
    orderData.price = payload.price;
  }
  const headers = await generateHeadersKucoin(
    credentials,
    method,
    KUCOIN_SPOT_CREATE_ORDER_ENDPOINT,
    JSON.stringify(orderData),
    "spot"
  );

  try {
    const response = await axios.post(
      `${KUCOIN_SPOT_BASE_URL}${KUCOIN_SPOT_CREATE_ORDER_ENDPOINT}`,
      orderData,
      { headers }
    );

    const responseData = response.data;

    // Manual error check
    if (responseData.code !== "200000") {
      throw new Error(responseData.msg || "KuCoin API returned an error");
    }

    return responseData.data || {};
  } catch (error: any) {
    // logger.error("ERROR_CREATING_KUCOIN_SPOT_ORDER", {
    //   error: error?.response?.data || error?.message,
    // });
    handleKucoinError(error);
  }
}

// ----------------------FUTURES-------------------------

export async function getKucoinFuturesBalances(config: KucoinConfig) {
  const method = "GET";
  const headers = await generateHeadersKucoin(
    config,
    method,
    KUCOIN_FUTURE_BALANCE_ENDPOINT + "?currency=USDT",
    "",
    "futures"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_FUTURES_BASE_URL}${KUCOIN_FUTURE_BALANCE_ENDPOINT}?currency=USDT`,
      {
        headers,
      }
    );
    const futuresBalance = response.data?.data || {};
    const filteredBalances = {
      currency: futuresBalance.currency,
      balance: parseFloat(futuresBalance.availableBalance || "0"),
      locked_balance: parseFloat(
        futuresBalance.positionMargin + futuresBalance.orderMargin || "0"
      ),
    };
    return [filteredBalances];
  } catch (error: any) {
    handleKucoinError(error);
  }
}

export async function ensureKucoinMarginMode(
  config: KucoinConfig,
  symbol: string,
  desiredMode: string
) {
  const endpoint = `/api/v1/positions?symbol=${symbol}`;
  const headers = await generateHeadersKucoin(
    config,
    "GET",
    endpoint,
    "",
    "futures"
  );

  const { data } = await axios.get(`${KUCOIN_FUTURES_BASE_URL}${endpoint}`, {
    headers,
  });
  const currentMode = data.data.crossMode ? "CROSS" : "ISOLATED";

  if (currentMode !== desiredMode) {
    // logger.info("SWITCHING_KUCOIN_MARGIN_MODE", {
    //   symbol,
    //   from: currentMode,
    //   to: desiredMode,
    // });
    const changeEndpoint = "/api/v1/position/margin/mode/change";
    const body = JSON.stringify({ symbol, marginMode: desiredMode });
    const changeHeaders = await generateHeadersKucoin(
      config,
      "POST",
      changeEndpoint,
      body,
      "futures"
    );

    await axios.post(
      `${KUCOIN_FUTURES_BASE_URL}${changeEndpoint}`,
      { symbol, marginMode: desiredMode },
      { headers: changeHeaders }
    );
  }
}

export async function createKucoinFutureTrade(
  config: KucoinConfig,
  payload: KucoinFuturesOrderParams
) {
  const method = "POST";
  const endpoint = "/api/v1/orders";
  const marginType = payload.positionMarginType;

  const orderData = {
    clientOid: Date.now().toString(),
    symbol: payload.symbol,
    type: payload.orderType.toLowerCase(), // "limit" or "market"
    side: payload.side.toLowerCase(), // "buy" or "sell"
    leverage: payload.leverage,
    marginMode: marginType, // "cross" or "isolated"
    qty: payload.quantity.toString(), // Size of the order
  } as any;
  if (payload.stopPrice) {
    orderData.stopPrice = payload.stopPrice.toString();
  }
  // Add optional parameters if provided
  if (payload.orderType === "LIMIT" && payload.price) {
    orderData.price = payload.price.toString();
  }
  const body = JSON.stringify(orderData);
  const headers = await generateHeadersKucoin(
    config,
    method,
    endpoint,
    body,
    "futures"
  );

  try {
    const response = await axios.post(
      `${KUCOIN_FUTURES_BASE_URL}${endpoint}`,
      orderData,
      { headers }
    );

    if (response.data.code !== "200000") {
      throw new Error(response.data.msg || "KuCoin API returned an error");
    }

    return response.data.data || {};
  } catch (error: any) {
    // logger.error("ERROR_CREATING_KUCOIN_FUTURES_ORDER", {
    //   error: error?.response?.data.msg || error?.message,
    // });
    handleKucoinError(error);
  }
}

// TODO : Implement commented code
export async function getKucoinFuturesActivePositions(config: KucoinConfig) {
  const method = "GET";

  const headers = await generateHeadersKucoin(
    config,
    method,
    KUCOIN_FUTURE_GET_POSITIONS_ENDPOINT,
    "",
    "futures"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_FUTURES_BASE_URL}${KUCOIN_FUTURE_GET_POSITIONS_ENDPOINT}`,
      { headers }
    );

    if (response.data.code !== "200000") {
      throw {
        code: "EXCHANGE_UNAVAILABLE",
        message: response.data.msg || "KuCoin API returned an error",
      };
    }

    const positionsData = response.data.data || [];
    const activePositions = positionsData.filter((pos: any) => pos.isOpen);
    if (activePositions.length === 0) {
      return [];
    }
    const symbols = activePositions.map((position: any) => position.symbol);

    const symbolsData = await getSymbolData(symbols);

    return activePositions.map((position: any) => {
      const multiplier = symbolsData[position.symbol]?.multiplier || 1;

      const currentQty = parseFloat(position.currentQty || "0");
      const active_pos = currentQty * multiplier;
      const openingTs = position.openingTimestamp ?? null;
      const currentTs = position.currentTimestamp ?? null;

      console.log("KUCOIN_FUTURES_POSITION_DATA", {
        position: position,
        multiplier,
        active_pos,
        unrealized_pnl: position.unrealisedPnl,
      });
      return {
        id: position.id || "",
        pair: position.symbol || "",
        active_pos: active_pos,
        avg_price: parseFloat(position.avgEntryPrice || "0"),
        liquidation_price: parseFloat(position.liquidationPrice || "0"),
        leverage: parseFloat(position.leverage || "0"),
        mark_price: parseFloat(position.markPrice || "0"),
        margin:
          Math.abs(active_pos * parseFloat(position.avgEntryPrice || "0")) /
          parseFloat(position.leverage || "0"),
        margin_type: position.marginMode == "CROSS" ? "CROSSED" : "ISOLATED",
        unrealized_pnl: parseFloat(position.unrealisedPnl || "0"),

        created_at: openingTs ? new Date(openingTs).toISOString() : null,

        updated_at: openingTs ? new Date(openingTs).toISOString() : null,
      };
    });
  } catch (error: any) {
    // logger.error("ERROR_FETCHING_KUCOIN_FUTURES_POSITIONS", {
    //   error: error?.response?.data || error?.message,
    // });
    handleKucoinError(error);
  }
}
