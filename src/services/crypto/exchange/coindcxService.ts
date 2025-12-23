import axios from "axios";
import {
  COINDCX_BASE_URL,
  COINDCX_FUTURE_BALANCE_ENDPOINT,
  COINDCX_FUTURE_LIST_POSITIONS_ENDPOINT,
  COINDCX_FUTURE_ORDER_CREATE_ENDPOINT,
  COINDCX_FUTURES_TICKER_URL,
  COINDCX_FUTURES_URL,
  COINDCX_GET_FUTURES_CURRENT_PRICES_REALTIME_URL,
  COINDCX_ORDER_CREATE_ENDPOINT,
  COINDCX_SPOT_BALANCE_ENDPOINT,
  COINDCX_SPOT_URL,
  COINDCX_USER_INFO_ENDPOINT,
} from "../../../constants/crypto/externalUrls";
import {
  generateSignatureCoinDCX,
  handleCoinDCXError,
} from "../../../utils/crypto/exchange/coindcxUtils";
import {
  CoinDCXFuturesOrderParams,
  CoinDCXFuturesOrderType,
  CoinDCXSpotOrderParams,
  CoinDCXSpotOrderType,
  safeISO,
} from "../../../constants/crypto/exchange/coindcx";
import { CryptoExchange, TradeSide } from "@prisma/client";
import { formatSymbols } from "../../../utils/crypto/format";

// --------------------UTILITIES------------------------
// SCRAPE SYMBOLS
export async function getCoinDCXAllData() {
  try {
    const [spotResponse, futuresResponse, tickerResponse] = await Promise.all([
      axios.get(COINDCX_SPOT_URL),
      axios.get(COINDCX_FUTURES_URL),
      axios.get(COINDCX_FUTURES_TICKER_URL),
    ]);

    const appData = spotResponse.data.currency_pairs;
    const futuresData = futuresResponse.data.instruments;
    const tickerData = tickerResponse.data; // Array of ticker objects
    const tickerSymbolsSet = new Set(
      tickerData.map((item: any) => item.market.toUpperCase())
    );

    const spotSymbols = formatSymbols({
      data: appData,
      keys: {
        symbol: "coindcx_name",
        base: "target_currency_short_name",
        quote: "base_currency_short_name",
      },
    });

    const futureSymbols = formatSymbols({
      data: futuresData,
      keys: {
        symbol: "symbol",
        base: "position_currency_short_name",
        quote: "quote_currency_short_name",
      },
    }).filter((item) => tickerSymbolsSet.has(item.symbol.toUpperCase()));

    return {
      exchange: CryptoExchange.COINDCX,
      spotSymbols,
      futureSymbols,
    };
  } catch (error) {
    // logger.error("ERROR_FETCHING_COINDCX_DATA", { error });
    // throw error;
    handleCoinDCXError(error);
  }
}

// Verify CoinDCX Credentials
export async function verifyCoinDCXCredentials(credentials: {
  apiKey: string;
  apiSecret: string;
}) {
  const payload = { timestamp: Math.floor(Date.now()) };
  const signature = generateSignatureCoinDCX(payload, credentials.apiSecret);
  try {
    const response = await axios.post(
      `${COINDCX_BASE_URL}${COINDCX_USER_INFO_ENDPOINT}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-APIKEY": credentials.apiKey,
          "X-AUTH-SIGNATURE": signature,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    handleCoinDCXError(error);
  }
}

// -----------------------SPOT---------------------------

export const getCoinDCXSpotBalances = async (credentials: any) => {
  const timestamp = Math.floor(Date.now() / 1000);

  const body: any = { timestamp };
  const signature = generateSignatureCoinDCX(body, credentials.apiSecret);

  try {
    const response = await axios.post(
      `${COINDCX_BASE_URL}${COINDCX_SPOT_BALANCE_ENDPOINT}`,
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-APIKEY": credentials.apiKey,
          "X-AUTH-SIGNATURE": signature,
        },
      }
    );
    const filteredData = response.data;
    return filteredData;
  } catch (error: any) {
    handleCoinDCXError(error);
  }
};

export const createCoinDCXSpotTrade = async (
  credentials: any,
  payload: CoinDCXSpotOrderParams
) => {
  const timestamp = Date.now();
  const client_order_id = `order_${payload.side}_${Date.now()}`;
  // const qty = Number(payload.quantity);
  const qty = Number(payload.quantity);
  console.log(qty, typeof qty);

  const body: any = {
    side: payload.side.toLowerCase(),
    order_type: payload.orderType,
    market: payload.symbol,
  };

  // Add price_per_unit BEFORE total_quantity (as per docs order)
  if (payload.orderType === CoinDCXSpotOrderType.LIMIT && payload.price) {
    body.price_per_unit = payload.price;
  }

  // Now add quantity, timestamp, client_order_id in order
  body.total_quantity = payload.quantity;
  body.timestamp = timestamp;
  body.client_order_id = client_order_id;

  const signature = generateSignatureCoinDCX(body, credentials.apiSecret);
  console.log(body);
  console.log(`${COINDCX_BASE_URL}${COINDCX_ORDER_CREATE_ENDPOINT}`)
  try {
    const response = await axios.post(
      `${COINDCX_BASE_URL}${COINDCX_ORDER_CREATE_ENDPOINT}`,
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-APIKEY": credentials.apiKey,
          "X-AUTH-SIGNATURE": signature,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    // logger.error("ERROR_CREATING_SPOT_ORDER_COINDCX", {
    //   error: error?.response?.data || error?.message,
    // });
    handleCoinDCXError(error);
  }
};

// ----------------------FUTURES-------------------------

export const getCoinDCXFuturesBalances = async (credentials: any) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = { timestamp };
  const signature = generateSignatureCoinDCX(body, credentials.apiSecret);
  try {
    const response = await axios.get(
      `${COINDCX_BASE_URL}${COINDCX_FUTURE_BALANCE_ENDPOINT}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-APIKEY": credentials.apiKey,
          "X-AUTH-SIGNATURE": signature,
        },
        data: body,
      }
    );
    const rawData = response.data;
    const formattedBalances = rawData.map((item: any) => {
      const currency = item.currency_short_name || ""; // Example: "INR"
      return {
        currency,
        balance: parseFloat(item.balance || "0"),
        locked_balance: parseFloat(item.locked_balance || "0"),
      };
    });
    return formattedBalances;
  } catch (error: any) {
    handleCoinDCXError(error);
  }
};
export const createCoinDCXFutureTrade = async (
  credentials: any,
  payload: CoinDCXFuturesOrderParams
) => {
  const timestamp = Math.floor(Date.now() / 1000); // Epoch timestamp in seconds
  const positionMarginType =
    payload.positionMarginType?.toLowerCase() ?? "isolated";
  const qty = Number(payload.quantity);

  // For market orders, don't include 'time_in_force', 'price', and 'stopPrice'
  if (payload.orderType === CoinDCXFuturesOrderType.MARKET) {
    payload.timeInForce = undefined; // Set to undefined as market orders shouldn't have this
    payload.price = undefined; // Market orders don't require price
    payload.stopPrice = undefined; // Market orders don't require stop price
  }

  const body: any = {
    timestamp,
    order: {
      side: payload.side.toLowerCase(),
      pair: payload.symbol,
      order_type: payload.orderType,
      total_quantity: qty,
      position_margin_type: positionMarginType,
      notification: payload.notification,
      price:
        payload.orderType === CoinDCXFuturesOrderType.MARKET
          ? null
          : payload.price, // Only include for non-market orders
      stop_price:
        payload.orderType === CoinDCXFuturesOrderType.MARKET
          ? null
          : payload.stopPrice, // Only include for non-market orders
      time_in_force: "good_till_cancel", // Only include for non-market orders
      margin_currency_short_name: payload.marginCurrency ?? "USDT",
    },
  };

  // Validate price and stopPrice for relevant order types
  if (payload.orderType !== CoinDCXFuturesOrderType.MARKET) {
    // Price validation for limit, stop limit, take profit limit
    if (payload.price === undefined) {
      throw {
        code: "BAD_REQUEST",
        message: `Price is required for ${payload.orderType} orders.`,
      };
    }
    body.price = payload.price;

    // Stop price validation for stop limit and take profit limit orders
    if (
      (payload.orderType === CoinDCXFuturesOrderType.STOP_MARKET ||
        payload.orderType === CoinDCXFuturesOrderType.STOP_LIMIT ||
        payload.orderType === CoinDCXFuturesOrderType.TAKE_PROFIT_MARKET ||
        payload.orderType === CoinDCXFuturesOrderType.TAKE_PROFIT_LIMIT) &&
      payload.stopPrice === undefined
    ) {
      throw {
        code: "BAD_REQUEST",
        message: `Stop price is required for ${payload.orderType} orders.`,
      };
    }

    // Add stop price to the body if it's present
    if (payload.stopPrice) {
      body.stop_price = payload.stopPrice;
    }

    // Additional validation for stop limit and take profit limit
    if (
      payload.orderType === CoinDCXFuturesOrderType.STOP_LIMIT ||
      payload.orderType === CoinDCXFuturesOrderType.TAKE_PROFIT_LIMIT
    ) {
      if (
        payload.side === TradeSide.BUY &&
        payload.stopPrice !== undefined &&
        payload.price <= payload.stopPrice
      ) {
        throw {
          code: "BAD_REQUEST",
          message:
            "For Buy Stop Limit/Take Profit Limit, price must be greater than stop price.",
        };
      }
      if (
        payload.side === TradeSide.SELL &&
        payload.stopPrice !== undefined &&
        payload.price >= payload.stopPrice
      ) {
        throw {
          code: "BAD_REQUEST",
          message:
            "For Sell Stop Limit/Take Profit Limit, price must be less than stop price.",
        };
      }
    }

    // Stop price specific validation
    if (payload.stopPrice !== undefined) {
      // Check if stopPrice is defined
      if (
        payload.side === TradeSide.BUY &&
        payload.stopPrice <= payload.price
      ) {
        throw {
          code: "BAD_REQUEST",
          message:
            "For Buy Stop Limit/Take Profit Limit, Stop price must be greater than the price.",
        };
      }
      if (
        payload.side === TradeSide.SELL &&
        payload.stopPrice >= payload.price
      ) {
        throw {
          code: "BAD_REQUEST",
          message:
            "For Sell Stop Limit/Take Profit Limit, Stop price must be less than the price.",
        };
      }
    }
  }
  // Add leverage if provided
  if (payload.leverage) {
    body.order.leverage = payload.leverage;
  }

  // Generate signature
  const signature = generateSignatureCoinDCX(body, credentials.apiSecret);

  try {
    const response = await axios.post(
      `${COINDCX_BASE_URL}${COINDCX_FUTURE_ORDER_CREATE_ENDPOINT}`,
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-APIKEY": credentials.apiKey,
          "X-AUTH-SIGNATURE": signature,
          "X-AUTH-TIMESTAMP": timestamp,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    // logger.error("ERROR_CREATING_FUTURE_ORDER_COINDCX", {
    //   error: error?.response?.data || error?.message,
    // });
    handleCoinDCXError(error);
  }
};

export const getCoinDCXFuturesActivePositions = async (
  credentials: any,
  marginCurrency: string[] = ["INR", "USDT"]
) => {
  const size = 50;
  let page = 1;
  let allActivePositions: any[] = [];

  // Step 1: Fetch active futures positions
  while (true) {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = {
      timestamp,
      page: String(page),
      size: String(size),
      margin_currency_short_name: marginCurrency,
    };

    const signature = generateSignatureCoinDCX(body, credentials.apiSecret);

    try {
      const response = await axios.post(
        `${COINDCX_BASE_URL}${COINDCX_FUTURE_LIST_POSITIONS_ENDPOINT}`,
        body,
        {
          headers: {
            "X-AUTH-APIKEY": credentials.apiKey,
            "X-AUTH-SIGNATURE": signature,
          },
        }
      );

      const positions = response?.data || [];
      const active = positions.filter((pos: any) => pos.active_pos != 0);
      allActivePositions.push(...active);

      if (allActivePositions.length >= size || positions.length === 0) {
        break;
      }

      page += 1;
    } catch (error: any) {
      // logger.error("ERROR_FETCHING_POSITIONS_COINDCX", {
      //   error: error?.message,
      // });
      handleCoinDCXError(error);
    }
  }

  // Step 2: Fetch mark prices from CoinDCX Futures Real-Time API
  let markPriceMap: Record<string, any> = {};
  try {
    const { data } = await axios.get(
      COINDCX_GET_FUTURES_CURRENT_PRICES_REALTIME_URL
    );
    markPriceMap = data?.prices || {};
  } catch (err) {
    // logger.error("ERROR_FETCHING_REALTIME_PRICES_COINDCX", { error: err });
    handleCoinDCXError(err);
  }

  // Step 3: Update each position with the corresponding mark_price
  const updatedPositions = allActivePositions.map((pos) => {
    const pairKey = pos.pair; // e.g., "B-BNB_USDT"
    const priceInfo = markPriceMap[pairKey];
    const mark_price = priceInfo?.mp ?? 0;

    return {
      ...pos,
      mark_price,
    };
  });

  const filteredPositions = updatedPositions.map((pos) => {
    const createdISO =
      safeISO(pos?.created_at) ||
      safeISO(pos?.updated_at) ||
      new Date().toISOString();

    const updatedISO = safeISO(pos?.updated_at) || new Date().toISOString();

    return {
      id: pos.id,
      pair: pos.pair,
      active_pos: pos.active_pos,
      avg_price: pos.avg_price,
      liquidation_price: pos.liquidation_price,
      leverage: pos.leverage,
      mark_price: pos.mark_price,
      margin_type: pos.margin_type.toUpperCase(),
      margin: Math.abs(pos.active_pos * pos.avg_price) / pos.leverage,
      unrealized_pnl: (pos.mark_price - pos.avg_price) * pos.active_pos, // basic calc
      take_profit_trigger: pos.take_profit_trigger,
      stop_loss_trigger: pos.stop_loss_trigger,
      created_at: createdISO,
      updated_at: updatedISO,
    };
  });

  return filteredPositions;
};

export const getFuturesPositionsByFilters = async (
  apiKey: string,
  apiSecret: string,
  {
    pairs,
    positionIds,
    marginCurrency = ["USDT"],
    page = 1,
    size = 50,
  }: {
    pairs?: string[];
    positionIds?: string[];
    marginCurrency?: string[];
    page?: number;
    size?: number;
  }
) => {
  if (
    (!pairs || pairs.length === 0) &&
    (!positionIds || positionIds.length === 0)
  ) {
    throw new Error("Either 'pairs' or 'positionIds' must be provided.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const body: Record<string, any> = {
    timestamp,
    page: String(page),
    size: String(size),
    margin_currency_short_name: [marginCurrency],
  };

  if (pairs && pairs.length > 0) {
    body["pairs"] = pairs.join(","); // e.g., "B-BTC_USDT,B-ETH_USDT"
  }
  if (positionIds && positionIds.length > 0) {
    body["position_ids"] = positionIds.join(",");
  }

  const signature = generateSignatureCoinDCX(body, apiSecret);

  try {
    const response = await axios.post(
      `${COINDCX_BASE_URL}${COINDCX_FUTURE_LIST_POSITIONS_ENDPOINT}`,
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-APIKEY": apiKey,
          "X-AUTH-SIGNATURE": signature,
        },
      }
    );

    const positions = response?.data || [];

    // Step 2: Fetch latest mark prices (real-time)
    let markPriceMap: Record<string, any> = {};
    try {
      const { data } = await axios.get(
        `${COINDCX_GET_FUTURES_CURRENT_PRICES_REALTIME_URL}`
      );
      markPriceMap = data?.prices || {};
    } catch (err) {
      console.log("ERROR_FETCHING_REALTIME_PRICES_COINDCX", {
        error: err,
      });
    }

    // Step 3: Add `mark_price` and `unrealized_pnl`
    const updatedPositions = positions.map((pos: any) => {
      const priceInfo = markPriceMap[pos.pair];
      const mark_price = priceInfo?.mp ?? pos.mark_price ?? 0;
      const unrealized_pnl = (mark_price - pos.avg_price) * pos.active_pos;

      return {
        id: pos.id,
        pair: pos.pair,
        active_pos: pos.active_pos,
        avg_price: pos.avg_price,
        liquidation_price: pos.liquidation_price,
        leverage: pos.leverage,
        mark_price,
        margin_type: (pos.margin_type ?? "isolated").toUpperCase(),
        unrealized_pnl,
        created_at: pos?.updated_at || Date.now(),
      };
    });

    return updatedPositions;
  } catch (error: any) {
    console.log("ERROR_FETCHING_FILTERED_POSITIONS_COINDCX", { error });
    throw new Error(error);
  }
};

export async function getCoindcxFuturesSymbols(
  margin: "USDT" | "INR" = "USDT"
) {
  const url = `https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=${margin}`;
  const res = await axios.get(url);
  return res.data; // e.g., ["B-BTC_USDT", "B-ETH_USDT", ...]
}
