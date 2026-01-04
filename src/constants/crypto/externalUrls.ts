// -------------------------BINANCE------------------------------------
// SPOT
export const BINANCE_SPOT_URL = "https://api.binance.com/api/v3/exchangeInfo";
export const BINANCE_SPOT_BASE_URL = "https://api.binance.com";
export const BINANCE_SPOT_BALANCE_ENDPOINT = "/api/v3/account";
export const BINANCE_SPOT_GET_OPEN_ORDERS_ENDPOINT = "/api/v3/openOrders";
export const BINANCE_SPOT_CREATE_ORDER_ENDPOINT = "/api/v3/order";
export const BINANCE_SPOT_CANCEL_ORDER_ENDPOINT = "/api/v3/order";
export const BINANCE_SPOT_GET_ORDER_BY_ID_ENDPOINT = "/api/v3/order";
export const BINANCE_SPOT_GET_ORDERS_ENDPOINT = "/api/v3/allOrders";
export const BINANCE_SPOT_GET_TRADES_ENDPOINT = "/api/v3/myTrades";

// FUTURES
export const BINANCE_FUTURES_URL =
  "https://www.binance.com/fapi/v1/exchangeInfo";
export const BINANCE_FUTURES_BASE_URL = "https://fapi.binance.com";
export const BINANCE_FUTURES_BALANCE_ENDPOINT = "/fapi/v3/balance";
export const BINANCE_FUTURES_POSITIONS_ENDPOINT = "/fapi/v2/positionRisk";
export const BINANCE_FUTURES_CREATE_ORDER_ENDPOINT = "/fapi/v1/order";
export const BINANCE_FUTURES_CANCEL_ORDER_ENDPOINT = "/fapi/v1/order";
export const BINANCE_FUTURES_GET_ORDER_BY_ID_ENDPOINT = "/fapi/v1/order";
export const BINANCE_FUTURES_GET_ORDERS_ENDPOINT = "/fapi/v1/allOrders";
export const BINANCE_FUTURES_GET_TRADES_ENDPOINT = "/fapi/v1/userTrades";

// -------------------------KUCOIN------------------------------------
export const KUCOIN_SPOT_BASE_URL = "https://api.kucoin.com";
export const KUCOIN_VERIFY_API_KEY_ENDPOINT = "/api/v1/user/api-key";
export const KUCOIN_SPOT_URL = "https://api.kucoin.com/api/v2/symbols";
export const KUCOIN_FUTURES_URL =
  "https://api-futures.kucoin.com/api/v1/contracts/active";
export const KUCOIN_GET_SERVER_TIME_ENDPOINT = "/api/v1/timestamp";

//
// SPOT
export const KUCOIN_SPOT_BALANCE_ENDPOINT = "/api/v1/accounts";
export const KUCOIN_SPOT_CREATE_ORDER_ENDPOINT = "/api/v1/hf/orders/sync";
export const KUCOIN_SPOT_CANCEL_ORDER_ENDPOINT = "/api/v1/hf/orders/sync";
export const KUCOIN_SPOT_GET_ORDER_BY_ID_ENDPOINT = "/api/v1/hf/orders";
export const KUCOIN_SPOT_GET_OPEN_ORDERS_ENDPOINT = "/api/v1/hf/orders/active";
export const KUCOIN_SPOT_TRADE_HISTORY_ENDPOINT = "/api/v1/hf/fills";
export const KUCOIN_SPOT_GET_TOKEN_SOCKET_ENDPOINT = "/api/v1/bullet-private";

//
// FUTURE
export const KUCOIN_FUTURES_BASE_URL = "https://api-futures.kucoin.com";
export const KUCOIN_FUTURE_BALANCE_ENDPOINT = "/api/v1/account-overview";
export const KUCOIN_FUTURE_CREATE_ORDER_ENDPOINT = "/api/v1/orders";
export const KUCOIN_FUTURE_CANCEL_ORDER_ENDPOINT = "/api/v1/orders";
export const KUCOIN_FUTURE_GET_ORDER_BY_ID_ENDPOINT = "/api/v1/orders";
export const KUCOIN_FUTURE_GET_ORDERS_ENDPOINT = "/api/v1/orders";
export const KUCOIN_FUTURE_GET_TRADES_ENDPOINT = "/api/v1/fills";
export const KUCOIN_FUTURE_GET_STOP_ORDERS_ENDPOINT = "/api/v1/stopOrders";
export const KUCOIN_FUTURE_GET_POSITIONS_ENDPOINT = "/api/v1/positions";
export const KUCOIN_FUTURE_GET_SYMBOL_POSITION_ENDPOINT = "/api/v1/position";

// -------------------------COINDCX------------------------------------
export const COINDCX_BASE_URL = "https://api.coindcx.com/exchange/v1";
export const COINDCX_SPOT_URL = "https://api.coindcx.com/api/v1/app_data";
export const COINDCX_FUTURES_URL =
  "https://api.coindcx.com/api/v1/derivatives/futures/data/";
export const COINDCX_FUTURES_TICKER_URL =
  "https://api.coindcx.com/exchange/ticker";
export const COINDCX_USER_INFO_ENDPOINT = "/users/info";
export const COINDCX_GET_FUTURES_CURRENT_PRICES_REALTIME_URL =
  "https://public.coindcx.com/market_data/v3/current_prices/futures/rt";
// SPOT
export const COINDCX_ORDER_CREATE_ENDPOINT = "/orders/create";
export const COINDCX_ORDER_CANCEL_ENDPOINT = "/orders/cancel";
export const COINDCX_ACTIVE_ORDERS_ENDPOINT = "/orders/active_orders";
export const COINDCX_ORDER_STATUS_ENDPOINT = "/orders/status";
export const COINDCX_TRADE_HISTORY_ENDPOINT = "/orders/trade_history";
export const COINDCX_SPOT_BALANCE_ENDPOINT = "/users/balances";

// FUTURE
export const COINDCX_FUTURE_ORDER_CREATE_ENDPOINT =
  "/derivatives/futures/orders/create";
export const COINDCX_FUTURE_ORDER_CANCEL_ENDPOINT =
  "/derivatives/futures/orders/cancel";
export const COINDCX_FUTURE_LIST_ORDERS_ENDPOINT =
  "/derivatives/futures/orders";
export const COINDCX_FUTURE_EDIT_ORDER_ENDPOINT =
  "/derivatives/futures/orders/edit";
export const COINDCX_FUTURE_LIST_POSITIONS_ENDPOINT =
  "/derivatives/futures/positions";
export const COINDCX_FUTURE_UPDATE_LEVERAGE_ENDPOINT =
  "/derivatives/futures/positions/update_leverage";
export const COINDCX_FUTURE_ADD_MARGIN_ENDPOINT =
  "/derivatives/futures/positions/add_margin";
export const COINDCX_FUTURE_REMOVE_MARGIN_ENDPOINT =
  "/derivatives/futures/positions/remove_margin";
export const COINDCX_FUTURE_EXIT_POSITION_ENDPOINT =
  "/derivatives/futures/positions/exit";
export const COINDCX_FUTURE_CREATE_TPSL_ENDPOINT =
  "/derivatives/futures/positions/create_tpsl";
export const COINDCX_FUTURE_BALANCE_ENDPOINT = "/derivatives/futures/wallets";
export const COINDCX_FUTURES_TRADE_HISTORY_ENDPOINT =
  "/derivatives/futures/trades";
