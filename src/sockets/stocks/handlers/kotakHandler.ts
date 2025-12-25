import WebSocket from "ws";
import { StocksExchange } from "@prisma/client";
import {
  handleKotakOrderUpdate,
  handleKotakTradeUpdate,
} from "../../../services/stocks/exchangeSocketServices/kotakSocketService";
import { SocketManager } from "../../socketManagement";
import { logEvent } from "../../utils";

type KotakCredentials = {
  tradingToken: string;
  tradingSid: string;
  baseUrl: string; // THIS IS IMPORTANT
};

export const KotakOrderHandler = {
  connect(userId: string, credentials: KotakCredentials) {
    const wsUrl =
      credentials.baseUrl.replace("https://", "wss://") +
      "/hypersync/interactive";

    const socket = new WebSocket(wsUrl);

    socket.on("open", () => {
      logEvent("CONNECTED", {
        userId,
        exchange: StocksExchange.KOTAK,
        market: "ORDERS",
      });

      socket.send(
        JSON.stringify({
          type: "cn",
          Authorization: credentials.tradingToken,
          Sid: credentials.tradingSid,
          source: "WEB",
        })
      );
    });

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.type === "order") {
          handleKotakOrderUpdate(message.data, userId);
        }

        if (message.type === "trade") {
          handleKotakTradeUpdate(message.data, userId);
        }
      } catch (err) {
        console.error("KOTAK_WS_PARSE_ERROR", err);
      }
    });

    socket.on("error", (err) => {
      console.error("KOTAK_WS_ERROR", { userId, err });
    });

    socket.on("close", () => {
      logEvent("CLOSED", {
        userId,
        exchange: StocksExchange.KOTAK,
        market: "ORDERS",
      });
      SocketManager.removeSocket(userId, StocksExchange.KOTAK, "ORDERS");
    });

    SocketManager.registerSocket(
      userId,
      StocksExchange.KOTAK,
      "ORDERS",
      socket,
      "stock"
    );

    return socket;
  },
};
