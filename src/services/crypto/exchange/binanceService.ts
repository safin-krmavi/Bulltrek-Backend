import axios from "axios";
import {
  BINANCE_FUTURES_BALANCE_ENDPOINT,
  BINANCE_FUTURES_BASE_URL,
  BINANCE_SPOT_BASE_URL,
  BINANCE_SPOT_BALANCE_ENDPOINT,
  BINANCE_FUTURES_POSITIONS_ENDPOINT,
  BINANCE_SPOT_URL,
  BINANCE_FUTURES_URL,
  BINANCE_CREATE_ORDER_ENDPOINT,
  BINANCE_SPOT_GET_ORDERS_ENDPOINT,
  BINANCE_SPOT_GET_TRADES_ENDPOINT,
  BINANCE_FUTURES_GET_TRADES_ENDPOINT,
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
export async function getBinanceUSDTData() {
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
      credentials.apiSecret
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
export async function getBinanceSpotBalances(credentials: any) {
  try {
    const timestamp = Date.now();
    const queryString = createQueryString({ timestamp });
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret
    );

    const url = `${BINANCE_SPOT_BASE_URL}${BINANCE_SPOT_BALANCE_ENDPOINT}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": credentials.apiKey,
      },
    });
    const filteredData = response.data.balances.map((item: any) => {
      return {
        currency: item.asset,
        balance: parseFloat(item.free || "0"),
        locked_balance: parseFloat(item.locked || "0"),
      };
    });
    return filteredData;
  } catch (error: any) {
    handleBinanceError(error);
  }
}

export async function createBinanceSpotTrade(
  credentials: any,
  params: BinanceSpotOrderParams
) {
  try {
    const endpoint = "/api/v3/order";
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
        baseParams.timeInForce = params.timeInForce || "GTC";
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
            `${params.orderType} order requires price and stopPrice`
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
      credentials.apiSecret
    );

    const url = `${BINANCE_SPOT_BASE_URL}${endpoint}`;

    const response = await axios.post(
      `${url}?${queryString}&signature=${signature}`,
      null,
      {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    // console.log("ERROR_CREATING_BINANCE_SPOT_ORDER", {
    //   error: (error as any)?.response?.data || (error as any)?.message || error,
    // });
    handleBinanceError(error);
  }
}

export async function getAllSpotOrdersBinance(
  apiKey: string,
  apiSecret: string,
  symbol?: string
) {
  try {
    const endpoint = BINANCE_SPOT_GET_ORDERS_ENDPOINT;
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

    const url = `${BINANCE_SPOT_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

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

export async function getSpotTradeHistoryBinance(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  startTime?: number,
  endTime?: number,
  limit?: number
) {
  try {
    const endpoint = BINANCE_SPOT_GET_TRADES_ENDPOINT;
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
    const signature = generateSignatureBinance(queryString, apiSecret);

    const url = `${BINANCE_SPOT_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": apiKey,
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
export async function getBinanceFuturesBalances(credentials: any) {
  try {
    const endpoint = BINANCE_FUTURES_BALANCE_ENDPOINT;
    const timestamp = Date.now();
    const queryString = createQueryString({ timestamp });
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret
    );

    const url = `${BINANCE_FUTURES_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

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

export async function createBinanceFutureTrade(
  credentials: any,
  params: BinanceFuturesOrderParams
) {
  try {
    const endpoint = BINANCE_CREATE_ORDER_ENDPOINT;
    const timestamp = Date.now();

    // Create params object with required parameters
    const requestParams: Record<string, any> = {
      symbol: params.symbol,
      side: params.side,
      type: params.orderType,
      quantity: params.quantity,
      timestamp,
      closePosition: params.closePosition ?? false,
    };

    // Validate quantity
    if (!params.quantity || isNaN(params.quantity) || params.quantity <= 0) {
      throw {
        code: "BAD_REQUEST",
        message: "Quantity must be a positive number",
      };
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
    if (
      ["LIMIT", "STOP", "TAKE_PROFIT"].includes(params.orderType) &&
      params.price
    ) {
      requestParams.price = params.price;
      requestParams.timeInForce = params.timeInForce;
    }

    if (
      ["STOP", "STOP_MARKET", "TAKE_PROFIT", "TAKE_PROFIT_MARKET"].includes(
        params.orderType
      ) &&
      params.stopPrice
    ) {
      requestParams.stopPrice = params.stopPrice;
    }

    if (params.orderType === "TRAILING_STOP_MARKET") {
      if (params.callbackRate) requestParams.callbackRate = params.callbackRate;
      if (params.activationPrice)
        requestParams.activationPrice = params.activationPrice;
    }

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret
    );
    const url = `${BINANCE_FUTURES_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;
    const response = await axios.post(url, null, {
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });
    return response.data;
  } catch (error: any) {
    // console.log("ERROR_PLACING_BINANCE_FUTURES_ORDER", {
    //   error: (error as any)?.response?.data || (error as any)?.message || error,
    // });
    handleBinanceError(error);
  }
}

/**
 * Get all futures orders for a symbol
 */
export async function getAllFuturesOrdersBinance(
  apiKey: string,
  apiSecret: string,
  params: {
    symbol: string;
  }
) {
  try {
    const endpoint = BINANCE_FUTURES_GET_TRADES_ENDPOINT;
    const timestamp = Date.now();

    const requestParams = { ...params, timestamp };
    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(queryString, apiSecret);

    const url = `${BINANCE_FUTURES_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { "X-MBX-APIKEY": apiKey },
    });

    return response.data;
  } catch (error: any) {
    console.log("ERROR_GETTING_BINANCE_ALL_FUTURES_ORDERS", {
      error: (error as any)?.response?.data || (error as any)?.message || error,
    });
    handleBinanceError(error);
  }
}

export async function getBinanceFuturesActivePositions(
  credentials: any,
  symbol?: string
) {
  try {
    const endpoint = BINANCE_FUTURES_POSITIONS_ENDPOINT;
    const timestamp = Date.now();

    const requestParams: Record<string, any> = { timestamp };
    if (symbol) requestParams.symbol = symbol;

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(
      queryString,
      credentials.apiSecret
    );

    const url = `${BINANCE_FUTURES_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

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
              position.positionAmt * parseFloat(position.entryPrice || "0")
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

export async function getActiveFuturesPositionsBySymbol(
  apiKey: string,
  apiSecret: string,
  symbol: string
) {
  try {
    const endpoint = BINANCE_FUTURES_POSITIONS_ENDPOINT;
    const timestamp = Date.now();

    const requestParams: Record<string, any> = { timestamp };
    if (symbol) requestParams.symbol = symbol;

    const queryString = createQueryString(requestParams);
    const signature = generateSignatureBinance(queryString, apiSecret);

    const url = `${BINANCE_FUTURES_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

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
        "Failed to get active futures positions"
    );
  }
}
