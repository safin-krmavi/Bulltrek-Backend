import { KiteTicker } from "kiteconnect";
import { StocksExchange } from "@prisma/client";
import {
  handleZerodhaOrderUpdate,
  handleZerodhaTradeUpdate,
} from "../../../services/stocks/exchangeSocketServices/zerodhaSocketService";
import { logEvent } from "../../utils";
import { SocketManager } from "../../socketManagement";

type ZerodhaCredentials = {
  apiKey: string;
  accessToken: string;
};

export const ZerodhaOrderHandler = {
  async connect(userId: string, credentials: ZerodhaCredentials) {
    const { apiKey, accessToken } = credentials;

    console.log("ZERODHA_CONNECTING", { userId, apiKey, accessToken });
    const ticker = new KiteTicker({
      api_key: apiKey,
      access_token: accessToken,
    });

    ticker.on("connect", () => {
      logEvent("CONNECTED", {
        userId,
        exchange: StocksExchange.ZERODHA,
        market: "ORDERS",
      });
    });

    ticker.on("order_update", (order) => {
      console.log("ZERODHA_ORDER_UPDATE", { userId, order });

      handleZerodhaOrderUpdate(order, userId);
    });

    // ticker.on("trade", (trade) => {
    //   console.log("ZERODHA_TRADE_UPDATE", { userId, trade });

    //   handleZerodhaTradeUpdate(trade, userId);
    // });

    ticker.on("reconnect", (attempt, delay) => {
      console.log("ZERODHA_RECONNECTING", { userId, attempt, delay });
    });

    ticker.on("noreconnect", () => {
      console.log("ZERODHA_NO_RECONNECT", { userId });
      SocketManager.removeSocket(userId, StocksExchange.ZERODHA, "ORDERS");
    });

    ticker.on("disconnect", () => {
      console.log("ZERODHA_DISCONNECTED", { userId });
    });

    ticker.on("error", (err) => {
      console.log("ZERODHA_SOCKET_ERROR", {
        userId,
        message: err?.message || err,
      });
    });

    ticker.on("close", () => {
      logEvent("CLOSED", {
        userId,
        exchange: StocksExchange.ZERODHA,
        market: "ORDERS",
      });
    });

    ticker.connect();

    SocketManager.registerSocket(
      userId,
      StocksExchange.ZERODHA,
      "ORDERS",
      ticker,
      "stock"
    );

    return ticker;
  },
};
