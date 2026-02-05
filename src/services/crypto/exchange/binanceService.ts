import axios from "axios";
import {
  BINANCE_FUTURES_BALANCE_ENDPOINT,
  BINANCE_FUTURES_BASE_URL,
  BINANCE_SPOT_BASE_URL,
  BINANCE_SPOT_BALANCE_ENDPOINT,
  BINANCE_FUTURES_POSITIONS_ENDPOINT,
  BINANCE_SPOT_URL,
  BINANCE_FUTURES_URL,
  BINANCE_SPOT_GET_ORDERS_ENDPOINT,
  BINANCE_SPOT_GET_TRADES_ENDPOINT,
  BINANCE_FUTURES_GET_TRADES_ENDPOINT,
  BINANCE_SPOT_CANCEL_ORDER_ENDPOINT,
  BINANCE_SPOT_GET_ORDER_BY_ID_ENDPOINT,
  BINANCE_SPOT_GET_OPEN_ORDERS_ENDPOINT,
  BINANCE_FUTURES_CREATE_ORDER_ENDPOINT,
  BINANCE_FUTURES_CANCEL_ORDER_ENDPOINT,
  BINANCE_FUTURES_GET_ORDER_BY_ID_ENDPOINT,
  BINANCE_SPOT_CREATE_ORDER_ENDPOINT,
  BINANCE_FUTURES_GET_ORDERS_ENDPOINT,
} from "../../../constants/crypto/externalUrls";
import {
  createQueryString,
  generateSignatureBinance,
  handleBinanceError,
} from "../../../utils/crypto/exchange/binanceUtils";
import {
  BinanceSpotOrderParams,
  BinanceFuturesOrderParams,
} from "../../../constants/crypto/exchange/binance";
import { formatSymbols } from "../../../utils/crypto/format";

// --------------------UTILITIES------------------------
// SCRAPE SYMBOLS
export async function fetchBinanceSymbols() {
  try {
    const [spotResponse, futuresResponse] = await Promise.all([
      axios.get(BINANCE_SPOT_URL),
      axios.get(BINANCE_FUTURES_URL),
    ]);

    const spotData = spotResponse.data?.symbols ?? [];
    const futuresData = futuresResponse.data?.symbols ?? [];

    const spotSymbols = formatSymbols({
      data: spotData,
      keys: {
        symbol: "symbol",
        base: "baseAsset",
        quote: "quoteAsset",
      },
    });

    const futureSymbols = formatSymbols({
      data: futuresData,
      keys: {
        symbol: "symbol",
        base: "baseAsset",
        quote: "quoteAsset",
      },
    });

    return {
      exchange: "BINANCE",
      spotSymbols,
      futureSymbols,
    };
  } catch (error) {
    // console.log("ERROR_FETCHING_BINANCE_DATA", {
    //   error: (error as any)?.response?.data || (error as any)?.message || error,
    // });
    handleBinanceError(error);
    // throw error;
  }
}

export async function verifyBinanceCredentials(credentials: any) {
  try {
    const timestamp = Date.now();
    const queryString = createQueryString({ timestamp });
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const fullUrl = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_BALANCE_ENDPOINT}`;

    const response = await axios.get(fullUrl, {
      headers: {
        "X-MBX-APIKEY": credentials.apiKey,
      },
      params: {
        timestamp,
        signature,
      },
    });

    return response.data;
  } catch (error: any) {
    handleBinanceError(error);
  }
}

// -----------------------SPOT---------------------------
export async function fetchBinanceSpotBalances(credentials: any) {
  try {
    const { apiKey, apiSecret } = credentials;

    const timestamp = Date.now();
    const query = createQueryString({ timestamp });
    const signature = generateSignatureBinance(query, apiSecret);

    const url = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_BALANCE_ENDPOINT}?${query}&signature=${signature}`;

    const { data } = await axios.get(url, {
      headers: { "X-MBX-APIKEY": apiKey },
    });

    return data.balances.map((asset: any) => ({
      currency: asset.asset,
      balance: Number(asset.free),
      lockedBalance: Number(asset.locked),
    }));
  } catch (error: any) {
    console.error("[BINANCE][SPOT][BALANCE] Failed", {
      error: error?.response?.data || error.message,
    });

    handleBinanceError(error);
  }
}

export async function createBinanceSpotOrder(
  credentials: any,
  params: BinanceSpotOrderParams,
) {
  try {
    const timestamp = Date.now();

    const baseParams: any = {
      symbol: params.symbol,
      side: params.side,
      quantity: params.quantity,
      type: params.orderType,
      newOrderRespType: "RESULT",
      timestamp,
    };
    switch (params.orderType) {
      case "LIMIT":
      case "LIMIT_MAKER":
        // Mandatory: timeInForce, quantity, price
        if (!params.price) {
          throw new Error(`${params.orderType} order requires price`);
        }
        baseParams.timeInForce = params?.timeInForce || "GTC";
        baseParams.price = params.price;
        break;

      case "STOP_LOSS":
      case "TAKE_PROFIT":
        if (!params.stopPrice) {
          throw new Error(`${params.orderType} order requires stopPrice`);
        }
        baseParams.stopPrice = params.stopPrice;
        break;

      case "STOP_LOSS_LIMIT":
      case "TAKE_PROFIT_LIMIT":
        // Mandatory: stopPrice

        if (!params.price || !params.stopPrice) {
          throw new Error(
            `${params.orderType} order requires price and stopPrice`,
          );
        }
        baseParams.timeInForce = params.timeInForce || "GTC";
        baseParams.price = params.price;
        baseParams.stopPrice = params.stopPrice;
        break;
    }

    const queryString = createQueryString(baseParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_CREATE_ORDER_ENDPOINT}`;

    const response = await axios.post(
      `${url}?${queryString}&signature=${signature}`,
      null,
      {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
        },
      },
    );

    return response.data;
  } catch (error: any) {
    // console.log("ERROR_CREATING_BINANCE_SPOT_ORDER", {
    //   error: (error as any)?.response?.data || (error as any)?.message || error,
    // });
    handleBinanceError(error);
  }
}

export async function cancelBinanceSpotOrder(
  credentials: any,
  symbol: string, // Trading pair symbol (e.g., 'BTCUSDT')
  userId: string,
  orderId: number,
) {
  try {
    const timestamp = Date.now();
    if (!orderId) {
      throw new Error("'orderId' must be provided");
    }

    const requestParams: Record<string, any> = {
      symbol,
      orderId,
      timestamp,
    };

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_CANCEL_ORDER_ENDPOINT}`;

    const response = await axios.delete(
      `${url}?${queryString}&signature=${signature}`,
      {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
        },
      },
    );

    return response.data;
  } catch (error: any) {
    const data = error.response?.data || {};
    const message = data?.msg || error.message;

    console.log("ERROR_CANCELING_BINANCE_SPOT_ORDER", { error: message });

    // try {
    if (data?.code === -2011 && message === "Unknown order sent.") {
      console.log("BINANCE_ORDER_ALREADY_CANCELLED", {
        orderId,
        userId,
      });

      // await new Promise((resolve) => setTimeout(resolve, 5000));

      // await cleanUpDuplicateTrades({
      //   userId,
      //   exchange: Exchange.BINANCE,
      //   orderId: String(orderId),
      // });
    }
    // } catch (cleanupError: any) {
    //   console.log(
    //     "ERROR_CLEANING_UP_TRADES_AFTER_BINANCE_CANCELLATION_FAILURE",
    //     {
    //       error:
    //         (cleanupError as any)?.response?.data ||
    //         (cleanupError as any)?.message ||
    //         cleanupError,
    //     }
    //   );
    //   throw new Error(
    //     (cleanupError as any)?.response?.data?.message ||
    //       (cleanupError as any)?.message
    //   );
    // }

    throw new Error(message);
  }
}

export async function fetchBinanceSpotOrderById(
  credentials: any,
  symbol: string,
  orderId: number,
) {
  try {
    const timestamp = Date.now();

    if (!orderId) {
      throw new Error("'orderId' must be provided");
    }

    const requestParams: Record<string, any> = {
      symbol,
      orderId,
      timestamp,
    };

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_GET_ORDER_BY_ID_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": credentials.apiKey,
      },
    });

    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_SPOT_ORDER", {
      error: (error as any)?.response?.data || (error as any)?.message || error,
    });
    throw new Error(
      (error as any)?.response?.data?.msg ||
        (error as any)?.message ||
        "Failed to get spot order from Binance",
    );
  }
}

export async function fetchBinanceOpenSpotOrders(
  credentials: any,
  symbol?: string,
) {
  try {
    const timestamp = Date.now();

    const requestParams: Record<string, any> = {
      timestamp,
    };

    // Add symbol if provided
    if (symbol) {
      requestParams.symbol = symbol;
    }

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_GET_OPEN_ORDERS_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": credentials.apiKey,
      },
    });

    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_OPEN_SPOT_ORDERS", {
      error: (error as any)?.response?.data || (error as any)?.message || error,
    });
    throw new Error(
      (error as any)?.response?.data?.msg ||
        (error as any)?.message ||
        "Failed to get open spot orders from Binance",
    );
  }
}

export async function fetchBinanceSpotOrders(
  apiKey: string,
  apiSecret: string,
  symbol?: string,
) {
  try {
    const timestamp = Date.now();

    // Create params object with required timestamp
    const requestParams: Record<string, any> = {
      timestamp,
    };

    // Add symbol if provided
    if (symbol) {
      requestParams.symbol = symbol;
    }

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(queryString, apiSecret);

    const url = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_GET_ORDERS_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    });

    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_ALL_SPOT_ORDERS", {
      error: (error as any)?.response?.data || (error as any)?.message || error,
    });
    handleBinanceError(error);
  }
}

export async function fetchBinanceSpotTrades(
  credentials: any,
  symbol: string,
  startTime?: number,
  endTime?: number,
  limit?: number,
) {
  try {
    const timestamp = Date.now();

    // Create params object with required timestamp and symbol
    const requestParams: Record<string, any> = {
      symbol,
      timestamp,
    };

    // Add optional parameters if provided
    if (startTime) requestParams.startTime = startTime;
    if (endTime) requestParams.endTime = endTime;
    if (limit) requestParams.limit = limit;

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_GET_TRADES_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": credentials.apiKey,
      },
    });

    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_SPOT_TRADE_HISTORY", {
      error: (error as any)?.response?.data || (error as any)?.message || error,
    });
    handleBinanceError(error);
  }
}

// ----------------------FUTURES-------------------------
export async function fetchBinanceFuturesBalances(credentials: any) {
  try {
    const timestamp = Date.now();
    const queryString = createQueryString({ timestamp });
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_FUTURES_BASE_URL}${BINANCE_FUTURES_BALANCE_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": credentials.apiKey,
      },
    });
    const filteredData = response.data.map((item: any) => ({
      currency: item.asset,
      balance: parseFloat(item.balance),
      lockedBalance:
        parseFloat(item.balance) - parseFloat(item.availableBalance),
    }));

    return filteredData;
  } catch (error: any) {
    handleBinanceError(error);
  }
}
export async function changeLeverage(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  leverage: number,
) {
  try {
    const endpoint = "/fapi/v1/leverage";
    const timestamp = Date.now();

    const params = {
      symbol,
      leverage,
      timestamp,
    };

    const queryString = createQueryString(params);
    const signature = generateSignatureBinance(queryString, apiSecret);
    const url = `${BINANCE_FUTURES_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { "X-MBX-APIKEY": apiKey },
    });

    return response.data;
  } catch (error: any) {
    console.error("ERROR_CHANGING_BINANCE_LEVERAGE", {
      error:
        (error as any)?.response?.data?.msg || (error as any)?.message || error,
    });
    return (error as any)?.response?.data || { msg: (error as any)?.message };
  }
}
export async function ensureBinanceLeverage(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  leverage: number,
) {
  const result = await changeLeverage(apiKey, apiSecret, symbol, leverage);

  if (result?.msg?.includes("No need to change leverage")) {
    return { ok: true, changed: false };
  }

  if (result?.leverage === leverage) {
    return { ok: true, changed: true };
  }

  if (result?.msg) {
    throw new Error(result.msg);
  }

  return { ok: true, changed: true };
}

export async function createBinanceFuturesOrder(
  credentials: any,
  params: BinanceFuturesOrderParams,
) {
  try {
    // // Validate quantity
    // if (!params.quantity || isNaN(params.quantity) || params.quantity <= 0) {
    //   throw {
    //     code: "BAD_REQUEST",
    //     message: "Quantity must be a positive number",
    //   };
    // }

    // if (params.closePosition && params.quantity) {
    //   throw {
    //     code: "BAD_REQUEST",
    //     message: "Quantity must not be sent when closePosition is true",
    //   };
    // }
    if (params.leverage) {
      await ensureBinanceLeverage(
        credentials.apiKey,
        credentials.apiSecret,
        params.symbol,
        params.leverage,
      );
    }
    const timestamp = Date.now();

    // Create params object with required parameters
    const requestParams: Record<string, any> = {
      symbol: params.symbol,
      side: params.side,
      type: params.orderType,
      // quantity: params.quantity,
      timestamp,
      // closePosition: params.closePosition ?? false,
    };
    if (params.closePosition) {
      requestParams.closePosition = true;
    } else {
      requestParams.quantity = params.quantity;
    }

    if (["LIMIT", "STOP", "TAKE_PROFIT"].includes(params.orderType)) {
      if (
        params.price === undefined ||
        isNaN(params.price) ||
        params.price <= 0
      ) {
        throw {
          code: "BAD_REQUEST",
          message: `Price is required and must be a valid number for ${params.orderType} orders`,
        };
      }
    }

    // Add conditional parameters based on order type
    if (["LIMIT", "TAKE_PROFIT"].includes(params.orderType) && params.price) {
      requestParams.price = params.price;
      requestParams.timeInForce = params?.timeInForce || "GTC";
    }
    if (["STOP"].includes(params.orderType) && params.price) {
      requestParams.price = params.price;
    }

    if (
      ["STOP", "STOP_MARKET", "TAKE_PROFIT", "TAKE_PROFIT_MARKET"].includes(
        params.orderType,
      ) &&
      params.stopPrice
    ) {
      requestParams.stopPrice = params.stopPrice; // Mandatory
    }

    // if (params.orderType === "TRAILING_STOP_MARKET") {
    //   if (params.callbackRate) requestParams.callbackRate = params.callbackRate;
    //   if (params.activationPrice)
    //     requestParams.activationPrice = params.activationPrice;
    // }

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );
    console.log("PAYLOAD:", requestParams);
    const url = `${BINANCE_FUTURES_BASE_URL}${BINANCE_FUTURES_CREATE_ORDER_ENDPOINT}?${queryString}&signature=${signature}`;

    const { data } = await axios.post(url, null, {
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });

    console.info("[BINANCE][FUTURES][CREATE_ORDER] Order placed", {
      symbol: params.symbol,
      orderId: data.orderId,
    });

    return data;
  } catch (error: any) {
    console.error("[BINANCE][FUTURES][CREATE_ORDER] Failed", {
      symbol: params.symbol,
      error: error?.response?.data || error.message,
    });

    handleBinanceError(error);
  }
}

export async function cancelBinanceFuturesOrder(
  credentials: any,
  symbol: string,
  orderId: number,
  userId: string,
) {
  try {
    const timestamp = Date.now();

    if (!orderId) {
      throw new Error("'orderId' must be provided");
    }

    const requestParams = { symbol, orderId, timestamp };

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_FUTURES_BASE_URL}${BINANCE_FUTURES_CANCEL_ORDER_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.delete(url, {
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });

    return response.data;
  } catch (error: any) {
    const data = error.response?.data || {};
    const message = data?.msg || error.message;

    console.log("ERROR_CANCELING_BINANCE_FUTURES_ORDER", { error: message });

    // try {
    if (data?.code === -2011 && message === "Unknown order sent.") {
      console.log("BINANCE_ORDER_ALREADY_CANCELLED", {
        orderId: orderId,
        userId: userId,
      });

      //   await new Promise((resolve) => setTimeout(resolve, 5000));

      //   await cleanUpDuplicateTrades({
      //     userId: userId,
      //     exchange: Exchange.BINANCE,
      //     orderId: String(orderId),
      //   });
    }
    // } catch (cleanupError: any) {
    //   console.log(
    //     "ERROR_CLEANING_UP_TRADES_AFTER_BINANCE_CANCELLATION_FAILURE",
    //     {
    //       error:
    //         (cleanupError as any)?.response?.data ||
    //         (cleanupError as any)?.message ||
    //         cleanupError,
    //     }
    //   );
    //   throw new Error(
    //     (cleanupError as any)?.response?.data?.message ||
    //       (cleanupError as any)?.message
    //   );
    // }

    throw new Error(message);
  }
}

export async function fetchBinanceFuturesOrderById(
  credentials: any,
  symbol: string,
  orderId: number,
) {
  try {
    const timestamp = Date.now();

    if (!orderId) {
      throw new Error("'orderId' must be provided");
    }

    const requestParams = { symbol, orderId, timestamp };
    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_FUTURES_BASE_URL}${BINANCE_FUTURES_GET_ORDER_BY_ID_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });

    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_FUTURES_ORDER", {
      error: (error as any)?.response?.data || (error as any)?.message || error,
    });
    throw new Error(
      (error as any)?.response?.data?.msg ||
        (error as any)?.message ||
        "Failed to get futures order",
    );
  }
}

export async function fetchBinanceCurrentOpenOrder(
  apiKey: string,
  apiSecret: string,
  params: {
    symbol: string;
    orderId?: number;
    origClientOrderId?: string;
    recvWindow?: number;
  },
) {
  try {
    // Binance rule enforcement
    if (!params.symbol) {
      throw new Error("symbol is required");
    }

    if (!params.orderId && !params.origClientOrderId) {
      throw new Error("Either orderId or origClientOrderId must be provided");
    }

    const timestamp = Date.now();

    const requestParams = {
      ...params,
      timestamp,
    };

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(queryString, apiSecret);

    const url =
      `${BINANCE_FUTURES_BASE_URL}/fapi/v1/openOrder` +
      `?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    });

    return response.data; // SINGLE order object
  } catch (error: any) {
    console.log("ERROR_FETCHING_BINANCE_OPEN_ORDER", {
      error: error?.response?.data || error?.message || error,
    });
    handleBinanceError(error);
  }
}

export async function fetchBinanceFuturesOpenOrdersAll(
  apiKey: string,
  apiSecret: string,
  params?: {
    symbol?: string;
    recvWindow?: number;
  },
) {
  try {
    const timestamp = Date.now();

    const requestParams: Record<string, any> = {
      timestamp,
    };

    if (params?.symbol) {
      requestParams.symbol = params.symbol;
    }

    if (params?.recvWindow) {
      requestParams.recvWindow = params.recvWindow;
    }

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(queryString, apiSecret);

    const url =
      `${BINANCE_FUTURES_BASE_URL}/fapi/v1/openOrders` +
      `?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    });

    // ALWAYS returns an ARRAY
    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_FUTURES_OPEN_ORDERS", {
      error: error?.response?.data || error?.message || error,
    });
    handleBinanceError(error);
  }
}

/**
 * Get all futures orders for a symbol
 */
export async function fetchBinanceFuturesOrders(
  credentials: any,
  symbol: string,
) {
  try {
    const timestamp = Date.now();

    const requestParams = { symbol, timestamp };
    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_FUTURES_BASE_URL}${BINANCE_FUTURES_GET_ORDERS_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });

    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_ALL_FUTURES_ORDERS", {
      error: (error as any)?.response?.data || (error as any)?.message || error,
    });
    handleBinanceError(error);
  }
}

export async function fetchBinanceFuturesTrades(
  credentials: any,
  params: {
    symbol: string; // REQUIRED
    orderId?: number; // optional (must be used with symbol)
    startTime?: number; // optional
    endTime?: number; // optional
    fromId?: number; // optional (cannot be used with startTime/endTime)
    limit?: number; // optional (default 500, max 1000)
    recvWindow?: number; // optional
  },
) {
  try {
    const timestamp = Date.now();

    const requestParams = {
      ...params,
      timestamp,
    };

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_FUTURES_BASE_URL}${BINANCE_FUTURES_GET_TRADES_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": credentials.apiKey,
      },
    });

    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_FUTURES_TRADES", {
      error: error?.response?.data || error?.message || error,
    });
    handleBinanceError(error);
  }
}

export async function fetchBinanceFuturesActivePositions(
  credentials: any,
  symbol?: string,
) {
  try {
    const timestamp = Date.now();

    const requestParams: Record<string, any> = { timestamp };
    if (symbol) requestParams.symbol = symbol;

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret,
    );

    const url = `${BINANCE_FUTURES_BASE_URL}${BINANCE_FUTURES_POSITIONS_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });

    const positions = response.data;

    const activePositions = positions
      .filter((position: any) => parseFloat(position.positionAmt) !== 0)
      .map((position: any, index: number) => {
        return {
          id: `${position.symbol}_${index}`, // You can also use UUID or timestamp
          pair: position.symbol || "",
          active_pos: position.positionAmt,
          avg_price: parseFloat(position.entryPrice || "0"),
          liquidation_price: parseFloat(position.liquidationPrice || "0"),
          leverage: parseFloat(position.leverage || "0"),
          mark_price: parseFloat(position.markPrice || "0"),
          margin_type:
            position.marginType?.toUpperCase() === "CROSS"
              ? "CROSSED"
              : "ISOLATED",
          margin:
            Math.abs(
              position.positionAmt * parseFloat(position.entryPrice || "0"),
            ) / parseFloat(position.leverage || "0"),
          unrealized_pnl: parseFloat(position.unRealizedProfit || "0"),
          positionSide: position.positionSide,
          updated_at: new Date(position.updateTime || Date.now()).toISOString(),
        };
      });

    return activePositions;
  } catch (error: any) {
    // console.log("ERROR_GETTING_BINANCE_ACTIVE_FUTURES_POSITIONS", {
    //   error: (error as any)?.response?.data || (error as any)?.message || error,
    // });
    handleBinanceError(error);
  }
}

export async function fetchBinanceFuturesPositionsBySymbol(
  apiKey: string,
  apiSecret: string,
  symbol: string,
) {
  try {
    const timestamp = Date.now();

    const requestParams: Record<string, any> = { timestamp };
    if (symbol) requestParams.symbol = symbol;

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(queryString, apiSecret);

    const url = `${BINANCE_FUTURES_BASE_URL}${BINANCE_FUTURES_POSITIONS_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": apiKey },
    });

    const positions = response.data;

    const activePositions = positions.map((position: any, index: number) => {
      return {
        id: `${position.symbol}_${index}`, // You can also use UUID or timestamp
        pair: position.symbol || "",
        active_pos: position.positionAmt,
        avg_price: parseFloat(position.entryPrice || "0"),
        liquidation_price: parseFloat(position.liquidationPrice || "0"),
        leverage: parseFloat(position.leverage || "0"),
        mark_price: parseFloat(position.markPrice || "0"),
        margin_type:
          position.marginType?.toUpperCase() === "CROSS"
            ? "CROSSED"
            : "ISOLATED",
        unrealized_pnl: parseFloat(position.unRealizedProfit || "0"),
        positionSide: position.positionSide,
      };
    });

    return activePositions;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_ACTIVE_FUTURES_POSITIONS", {
      error: (error as any)?.response?.data || (error as any)?.message || error,
    });
    throw new Error(
      (error as any)?.response?.data?.msg ||
        (error as any)?.message ||
        "Failed to get active futures positions",
    );
  }
}

/**
 * ✅ FIXED: Fetch historical kline/candlestick data with segment support
 */
export async function fetchBinanceHistoricalKlines(
  symbol: string,
  interval: string = "1d", // 1m, 5m, 1h, 1d, 1w, 1M
  limit: number = 500, // Max 1000
  assetType: "SPOT" | "FUTURES" = "SPOT" // ✅ NEW parameter
): Promise<any[]> {
  try {
    // ✅ Use correct base URL based on asset type
    const baseUrl = assetType === "SPOT" 
      ? BINANCE_SPOT_BASE_URL 
      : BINANCE_FUTURES_BASE_URL;
    
    const endpoint = "/api/v3/klines";
    
    const url = `${baseUrl}${endpoint}`;

    console.log("[BINANCE_KLINES] Fetching historical data", {
      symbol,
      interval,
      limit,
      assetType, // ✅ Log asset type
      url,
    });

    const response = await axios.get(url, {
      params: {
        symbol,
        interval,
        limit,
      },
    });

    console.log("[BINANCE_KLINES] Fetched successfully", {
      symbol,
      assetType,
      candles: response.data.length,
      firstCandle: response.data[0],
      lastCandle: response.data[response.data.length - 1],
    });

    return response.data;
  } catch (error: any) {
    console.error("[BINANCE_KLINES] Error", {
      symbol,
      assetType,
      error: error.response?.data || error.message,
    });
    handleBinanceError(error);
    return [];
  }
}

/**
 * ✅ FIXED: Fetch market price with proper segment handling
 */
export async function fetchBinanceMarketPrice(params: {
  symbol: string;
  assetType: "SPOT" | "FUTURES";
}) {
  try {
    // ✅ Use correct base URL
    const baseUrl = params.assetType === "SPOT"
      ? BINANCE_SPOT_BASE_URL
      : BINANCE_FUTURES_BASE_URL;

    const endpoint = "/api/v3/ticker/price";
    const url = `${baseUrl}${endpoint}`;

    console.log("[BINANCE_PRICE] Fetching", {
      symbol: params.symbol,
      assetType: params.assetType,
      url,
    });

    const response = await axios.get(url, {
      params: { symbol: params.symbol },
    });

    const price = parseFloat(response.data.price);

    console.log("[BINANCE_PRICE] Success", {
      symbol: params.symbol,
      assetType: params.assetType,
      price,
    });

    return price;
  } catch (error: any) {
    console.error("[BINANCE_PRICE] Error", {
      symbol: params.symbol,
      assetType: params.assetType,
      error: error.response?.data || error.message,
    });
    handleBinanceError(error);
    return null;
  }
}
