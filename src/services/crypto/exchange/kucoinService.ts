import axios from "axios";
import {
  KUCOIN_FUTURE_BALANCE_ENDPOINT,
  KUCOIN_FUTURE_CANCEL_ORDER_ENDPOINT,
  KUCOIN_FUTURE_GET_ORDER_BY_ID_ENDPOINT,
  KUCOIN_FUTURE_GET_ORDERS_ENDPOINT,
  KUCOIN_FUTURE_GET_POSITIONS_ENDPOINT,
  KUCOIN_FUTURE_GET_STOP_ORDERS_ENDPOINT,
  KUCOIN_FUTURE_GET_SYMBOL_POSITION_ENDPOINT,
  KUCOIN_FUTURE_GET_TRADES_ENDPOINT,
  KUCOIN_FUTURES_BASE_URL,
  KUCOIN_FUTURES_URL,
  KUCOIN_SPOT_BALANCE_ENDPOINT,
  KUCOIN_SPOT_BASE_URL,
  KUCOIN_SPOT_CANCEL_ORDER_ENDPOINT,
  KUCOIN_SPOT_CREATE_ORDER_ENDPOINT,
  KUCOIN_SPOT_GET_OPEN_ORDERS_ENDPOINT,
  KUCOIN_SPOT_GET_ORDER_BY_ID_ENDPOINT,
  KUCOIN_SPOT_TRADE_HISTORY_ENDPOINT,
  KUCOIN_SPOT_URL,
  KUCOIN_VERIFY_API_KEY_ENDPOINT,
} from "../../../constants/crypto/externalUrls";
import {
  generateHeadersKucoin,
  handleKucoinError,
} from "../../../utils/crypto/exchange/kucoinUtils";
import {
  getSymbolData,
  KucoinConfig,
  KucoinFuturesOrderParams,
  KucoinSpotOrderParams,
} from "../../../constants/crypto/exchange/kucoin";
import { formatSymbols } from "../../../utils/crypto/format";

// --------------------UTILITIES------------------------
// SCRAPE SYMBOLS
export const fetchKucoinSymbols = async () => {
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
    // console.log("ERROR_FETCHING_KUCOIN_DATA", { error });
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

export async function fetchKucoinSpotBalances(config: KucoinConfig) {
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

export async function createKucoinSpotOrder(
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
    // console.log("ERROR_CREATING_KUCOIN_SPOT_ORDER", {
    //   error: error?.response?.data || error?.message,
    // });
    handleKucoinError(error);
  }
}

// Cancel Order by ID
export async function cancelKucoinSpotOrder(
  config: KucoinConfig,
  orderId: string,
  symbol: string,
  userId: string
) {
  const method = "DELETE";
  const endpoint = `${KUCOIN_SPOT_CANCEL_ORDER_ENDPOINT}/${orderId}`;
  const queryParams = `symbol=${symbol}`;
  const endpointWithParams = `${endpoint}?${queryParams}`;

  const headers = await generateHeadersKucoin(
    config,
    method,
    endpointWithParams,
    "",
    "spot"
  );

  try {
    const response = await axios.delete(
      `${KUCOIN_SPOT_BASE_URL}${endpointWithParams}`,
      {
        headers,
      }
    );
    console.log("CANCEL_KUCOIN_SPOT_ORDER_RESPONSE", { data: response?.data });

    if (response.data?.code === "400100") {
      console.log("KUCOIN_ORDER_CANCEL_WARNING", {
        code: "400100",
        message: response?.data?.msg,
      });
      // await cleanUpDuplicateTrades({
      //   userId,
      //   exchange: Exchange.KUCOIN,
      //   orderId,
      // });
      // throw new Error(response.data?.msg);
    }
    return response.data || {};
  } catch (error: any) {
    console.log("ERROR_CANCELING_KUCOIN_SPOT_ORDER", {
      error: error?.response?.data || error?.message,
    });
    throw error;
  }
}

// Get Spot Order By ID
export async function fetchKucoinSpotOrderById(
  config: KucoinConfig,
  orderId: string,
  symbol: string // Added symbol parameter with default value
) {
  const method = "GET";
  const endpoint = `${KUCOIN_SPOT_GET_ORDER_BY_ID_ENDPOINT}/${orderId}`;
  const queryParams = `symbol=${symbol}`; // BTC-USDT
  const endpointWithParams = `${endpoint}?${queryParams}`;

  // Generate headers with the full endpoint including query parameters
  const headers = await generateHeadersKucoin(
    config,
    method,
    endpointWithParams,
    "",
    "spot"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_SPOT_BASE_URL}${endpointWithParams}`,
      { headers }
    );
    console.log("KUCOIN_SPOT_ORDER_BY_ID_RESPONSE", { data: response?.data });
    return response.data.data || {};
  } catch (error: any) {
    handleKucoinError(error);
  }
}

// Get Open Spot Orders
export async function fetchKucoinOpenSpotOrders(
  config: KucoinConfig,
  symbol: string
) {
  const method = "GET";
  const queryParams = `symbol=${symbol}`;
  const endpointWithParams = `${KUCOIN_SPOT_GET_OPEN_ORDERS_ENDPOINT}?${queryParams}`;

  const headers = await generateHeadersKucoin(
    config,
    method,
    endpointWithParams,
    "",
    "spot"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_SPOT_BASE_URL}${endpointWithParams}`,
      { headers }
    );

    if (response.data?.code !== "200000") {
      throw new Error(response.data?.msg || "KuCoin API returned an error");
    }

    return response.data?.data || [];
  } catch (error: any) {
    console.log("ERROR_FETCHING_KUCOIN_OPEN_SPOT_ORDERS", {
      error: error?.response?.data || error?.message,
    });
    handleKucoinError(error);
  }
}

// Get Trade History
export async function fetchKucoinSpotTrades(config: KucoinConfig) {
  const method = "GET";

  const headers = await generateHeadersKucoin(
    config,
    method,
    KUCOIN_SPOT_TRADE_HISTORY_ENDPOINT + "?symbol=BTC-USDT",
    "",
    "spot"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_SPOT_BASE_URL}${KUCOIN_SPOT_TRADE_HISTORY_ENDPOINT}?symbol=BTC-USDT`,
      { headers }
    );
    const tradeHistory = response.data?.data?.items || [];
    return tradeHistory;
  } catch (error: any) {
    console.log("ERROR_FETCHING_KUCOIN_TRADE_HISTORY", {
      error: error?.response?.data || error?.message,
    });
    throw error;
  }
}

// ----------------------FUTURES-------------------------

export async function fetchKucoinFuturesBalances(config: KucoinConfig) {
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
  try {
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

    console.log("DATA HERE:", data);
    const currentMode = data.data.crossMode ? "CROSS" : "ISOLATED";
    console.log("CURRENT MODE:", currentMode, desiredMode);
    if (currentMode !== desiredMode) {
      console.log("SWITCHING_KUCOIN_MARGIN_MODE", {
        symbol,
        from: currentMode,
        to: desiredMode,
      });
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
  } catch (error) {
    console.log("ERROR", error?.response?.data);
    handleKucoinError(error);
  }
}

export async function createKucoinFuturesOrder(
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
    marginMode: marginType, // "CROSS" or "ISOLATED"
    qty: payload.quantity.toString(), // Size of the order
  } as any;

  // ✅ STOP ORDER SUPPORT
  if (payload.stop) {
    if (!payload.stopPrice || !payload.stopPriceType) {
      throw new Error(
        "stopPrice and stopPriceType are required when stop is provided"
      );
    }

    orderData.stop = payload.stop; // up | down
    orderData.stopPrice = payload.stopPrice;
    orderData.stopPriceType = payload.stopPriceType; // TP | IP | MP
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
    console.log("ORDER PAYLOAD", orderData);
    const response = await axios.post(
      `${KUCOIN_FUTURES_BASE_URL}${endpoint}`,
      orderData,
      { headers }
    );

    console.log("Response from Kucoin", response?.data);
    if (response.data.code !== "200000") {
      throw new Error(response.data.msg || "KuCoin API returned an error");
    }

    return response.data.data || {};
  } catch (error: any) {
    // console.log("ERROR_CREATING_KUCOIN_FUTURES_ORDER", {
    //   error: error?.response?.data.msg || error?.message,
    // });

    console.log("ERROR_CREATING_KUCOIN_FUTURES_ORDER", {
      error: error?.response?.data.msg || error?.message,
    });

    handleKucoinError(error);
  }
}

export async function cancelKucoinFuturesOrder(
  config: KucoinConfig,
  orderId: string,
  userId: string
) {
  const method = "DELETE";
  const endpoint = `${KUCOIN_FUTURE_CANCEL_ORDER_ENDPOINT}/${orderId}`;

  const headers = await generateHeadersKucoin(
    config,
    method,
    endpoint,
    "",
    "futures"
  );

  try {
    const response = await axios.delete(
      `${KUCOIN_FUTURES_BASE_URL}${endpoint}`,
      { headers }
    );

    if (response.data.code !== "200000") {
      throw new Error(response.data.msg || "KuCoin API returned an error");
    }

    return response.data.data || {};
  } catch (error: any) {
    const message = error?.response?.data || error?.message;

    console.log("ERROR_CANCELING_KUCOIN_FUTURES_ORDER", { error: message });

    // try {
    if (message === "The order cannot be canceled.") {
      console.log("KUCOIN_ORDER_CANNOT_BE_CANCELED_CLEANUP", { orderId });

      // await new Promise((resolve) => setTimeout(resolve, 5000));

      // await cleanUpDuplicateTrades({
      //   userId,
      //   exchange: Exchange.KUCOIN,
      //   orderId,
      // });
    }
    // } catch (cleanupError: any) {
    //   console.log("ERROR_CLEANUP_TRADES_KUCOIN_CANCELLATION_FAILURE", {
    //     error: cleanupError?.response?.data || cleanupError?.message,
    //   });
    //   throw new Error(
    //     cleanupError.response?.data?.message || cleanupError.message
    //   );
    // }

    handleKucoinError(error);
  }
}

// Get Futures Order by ID
export async function fetchKucoinFuturesOrderById(
  config: KucoinConfig,
  orderId: string,
  symbol: string // Added symbol parameter with default value
) {
  const method = "GET";
  const endpoint = `${KUCOIN_FUTURE_GET_ORDER_BY_ID_ENDPOINT}/${orderId}`;
  const queryParams = `symbol=${symbol}`;
  const endpointWithParams = `${endpoint}?${queryParams}`;

  const headers = await generateHeadersKucoin(
    config,
    method,
    endpointWithParams,
    "",
    "futures"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_FUTURES_BASE_URL}${endpointWithParams}`,
      {
        headers,
      }
    );

    if (response.data.code !== "200000") {
      throw new Error(response.data.msg || "KuCoin API returned an error");
    }

    return response.data.data || {};
  } catch (error: any) {
    console.log("ERROR_FETCHING_KUCOIN_FUTURES_ORDER", {
      error: error?.response?.data || error?.message,
    });
    throw error;
  }
}

export async function fetchKucoinFuturesOrders(
  config: KucoinConfig,
  params?: {
    status?: "active" | "done";
    symbol?: string;
    side?: "buy" | "sell";
    type?:
      | "limit"
      | "market"
      | "limit_stop"
      | "market_stop"
      | "oco_limit"
      | "oco_stop";
    startAt?: number;
    endAt?: number;
    currentPage?: number;
    pageSize?: number;
  }
) {
  const method = "GET";

  const queryParams = new URLSearchParams();

  if (params?.status) queryParams.append("status", params.status);
  if (params?.symbol) queryParams.append("symbol", params.symbol);
  if (params?.side) queryParams.append("side", params.side);
  if (params?.type) queryParams.append("type", params.type);
  if (params?.startAt) queryParams.append("startAt", String(params.startAt));
  if (params?.endAt) queryParams.append("endAt", String(params.endAt));
  if (params?.currentPage)
    queryParams.append("currentPage", String(params.currentPage));
  if (params?.pageSize) queryParams.append("pageSize", String(params.pageSize));

  const endpointWithParams = queryParams.toString()
    ? `${KUCOIN_FUTURE_GET_ORDERS_ENDPOINT}?${queryParams.toString()}`
    : KUCOIN_FUTURE_GET_ORDERS_ENDPOINT;

  const headers = await generateHeadersKucoin(
    config,
    method,
    endpointWithParams,
    "",
    "futures"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_FUTURES_BASE_URL}${endpointWithParams}`,
      { headers }
    );

    if (response.data.code !== "200000") {
      throw new Error(response.data.msg || "KuCoin API returned an error");
    }

    return response.data.data; // { currentPage, pageSize, totalNum, totalPage, items }
  } catch (error: any) {
    console.log("ERROR_FETCHING_KUCOIN_FUTURES_ORDERS", {
      error: error?.response?.data || error?.message,
    });
    throw error;
  }
}

export async function fetchKucoinFuturesTrades(
  config: KucoinConfig,
  params?: {
    orderId?: string;
    symbol?: string;
    side?: "buy" | "sell";
    type?: "limit" | "market" | "limit_stop" | "market_stop";
    tradeTypes?: string; // comma-separated: "trade,adl,liquid,settlement"
    startAt?: number;
    endAt?: number;
    currentPage?: number;
    pageSize?: number;
  }
) {
  const method = "GET";
  const queryParams = new URLSearchParams();

  if (params?.orderId) queryParams.append("orderId", params.orderId);
  if (params?.symbol) queryParams.append("symbol", params.symbol);
  if (params?.side) queryParams.append("side", params.side);
  if (params?.type) queryParams.append("type", params.type);
  if (params?.tradeTypes) queryParams.append("tradeTypes", params.tradeTypes);
  if (params?.startAt) queryParams.append("startAt", String(params.startAt));
  if (params?.endAt) queryParams.append("endAt", String(params.endAt));
  if (params?.currentPage)
    queryParams.append("currentPage", String(params.currentPage));
  if (params?.pageSize) queryParams.append("pageSize", String(params.pageSize));

  const endpointWithParams = queryParams.toString()
    ? `${KUCOIN_FUTURE_GET_TRADES_ENDPOINT}?${queryParams.toString()}`
    : `${KUCOIN_FUTURE_GET_TRADES_ENDPOINT}`;

  const headers = await generateHeadersKucoin(
    config,
    method,
    endpointWithParams,
    "",
    "futures"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_FUTURES_BASE_URL}${endpointWithParams}`,
      { headers }
    );

    if (response.data.code !== "200000") {
      throw new Error(response.data.msg || "KuCoin API returned an error");
    }

    return response.data.data || {};
  } catch (error: any) {
    console.log("ERROR_FETCHING_KUCOIN_FUTURES_TRADES", {
      error: error?.response?.data || error?.message,
    });
    throw error;
  }
}

export async function fetchKucoinFuturesStopOrders(
  config: KucoinConfig,
  // orderId: string,
  symbol: string // Added symbol parameter with default value
) {
  const method = "GET";
  const endpoint = KUCOIN_FUTURE_GET_STOP_ORDERS_ENDPOINT;
  const queryParams = `symbol=${symbol}`;
  const endpointWithParams = `${endpoint}?${queryParams}`;

  const headers = await generateHeadersKucoin(
    config,
    method,
    endpointWithParams,
    "",
    "futures"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_FUTURES_BASE_URL}${endpointWithParams}`,
      {
        headers,
      }
    );

    if (response.data.code !== "200000") {
      throw new Error(response.data.msg || "KuCoin API returned an error");
    }

    return response.data.data || {};
  } catch (error: any) {
    console.log("ERROR_FETCHING_KUCOIN_FUTURES_STOP_ORDERS", {
      error: error?.response?.data || error?.message,
    });
    throw error;
  }
}

// TODO : Implement commented code
export async function fetchKucoinFuturesActivePositions(config: KucoinConfig) {
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
    // console.log("ERROR_FETCHING_KUCOIN_FUTURES_POSITIONS", {
    //   error: error?.response?.data || error?.message,
    // });
    handleKucoinError(error);
  }
}

export async function fetchKucoinFuturesPositionBySymbol(
  config: KucoinConfig,
  symbol: string
) {
  const method = "GET";
  const endpoint = KUCOIN_FUTURE_GET_SYMBOL_POSITION_ENDPOINT;
  const queryParams = `symbol=${symbol}`;
  const endpointWithParams = `${endpoint}?${queryParams}`;

  const headers = await generateHeadersKucoin(
    config,
    method,
    endpointWithParams,
    "",
    "futures"
  );

  try {
    const response = await axios.get(
      `${KUCOIN_FUTURES_BASE_URL}${endpointWithParams}`,
      { headers }
    );

    if (response.data.code !== "200000") {
      throw new Error(response.data.msg || "KuCoin API returned an error");
    }

    const positionsData = response.data?.data || {};
    return positionsData;
  } catch (error: any) {
    console.log("ERROR_FETCHING_KUCOIN_SYMBOL_POSITION", {
      error: error?.response?.data || error?.message,
    });
    throw error;
  }
}

export async function fetchKucoinMarketPrice(params: {
  symbol: string;
  assetType: "SPOT" | "FUTURES";
}) {
  try {
    const { symbol, assetType } = params;

    if (!symbol) {
      throw new Error("Symbol must be provided");
    }

    let url = "";

    if (assetType === "SPOT") {
      // Spot: Get last traded price (Level 1 ticker)
      url = `${KUCOIN_SPOT_BASE_URL}/api/v1/market/orderbook/level1?symbol=${symbol}`;
      const response = await axios.get(url);

      if (response.data.code !== "200000") {
        throw new Error(
          response.data.msg || "KuCoin Spot API returned an error"
        );
      }

      return parseFloat(response.data.data.price); // Last traded price
    } else if (assetType === "FUTURES") {
      // Futures: Get mark price
      url = `${KUCOIN_FUTURES_BASE_URL}/api/v1/mark-price/${symbol}/current`;
      const response = await axios.get(url);

      if (response.data.code !== "200000") {
        throw new Error(
          response.data.msg || "KuCoin Futures API returned an error"
        );
      }

      return parseFloat(response.data.data.value); // Mark price
    } else {
      throw new Error("Invalid assetType, must be SPOT or FUTURES");
    }
  } catch (error: any) {
    console.error("[KUCOIN][MARKET_PRICE] Failed", {
      symbol: params.symbol,
      assetType: params.assetType,
      error: error?.response?.data || error.message,
    });
    handleKucoinError(error);
  }
}
