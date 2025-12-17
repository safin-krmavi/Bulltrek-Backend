import WebSocket from "ws";
import axios from "axios";
import { CryptoExchangeCredentials, logEvent } from "../utils";
import { CryptoExchange } from "@prisma/client";
import { enqueueBinanceTradeUpdate } from "./spotTradeQueues/binanceQueueManagement";
import {
  handleBinanceFutureOrderUpdate,
  handleBinanceSpotOrderUpdate,
} from "../../services/crypto/exchangeSocketServices/binanceSocketService";

type MarketType = "SPOT" | "FUTURES";

const BASE_URLS = {
  SPOT: "https://api.binance.com",
  FUTURES: "https://fapi.binance.com",
};

const WS_URLS = {
  SPOT: "wss://stream.binance.com:9443/ws",
  FUTURES: "wss://fstream.binance.com/ws",
};

interface BinanceUserDataStreamConnection {
  close(): Promise<void>;
}

export const BinanceHandler = {
  // Step 1: Get listen key from Binance REST API
  async getListenKey(
    apiKey: string,
    market: MarketType = "SPOT"
  ): Promise<string> {
    const url = `${BASE_URLS[market]}/${
      market === "SPOT" ? "api/v3/userDataStream" : "fapi/v1/listenKey"
    }`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-MBX-APIKEY": apiKey,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(
          `Error getting listen key: ${
            response.status
          } ${await response.text()}`
        );
      }
      const data = await response.json();
      if (!data.listenKey) throw new Error("Listen key missing in response");
      return data.listenKey;
    } catch (error) {
      console.log("FAILED_TO_GET_LISTEN_KEY:", { error });
      throw error;
    }
  },
  // Step 2: Keep listen key alive (should be called every ~30-45 minutes)
  async keepAliveListenKey(
    apiKey: string,
    listenKey: string,
    market: MarketType = "SPOT"
  ): Promise<boolean> {
    const url = `${BASE_URLS[market]}/${
      market === "SPOT" ? "api/v3/userDataStream" : "fapi/v1/listenKey"
    }?listenKey=${listenKey}`;
    try {
      const response = await axios.put(url, null, {
        headers: {
          "X-MBX-APIKEY": apiKey,
          "Content-Type": "application/json",
        },
      });
      if (response.status === 200) {
        console.log(`BINANCE_LISTEN_KEY_KEEP_ALIVE_SUCCESS`, { market });
        return true;
      }
      console.log(`BINANCE_LISTEN_KEY_KEEP_ALIVE_ERROR`, {
        market,
        status: response.status,
        data: response.data,
      });
      return false;
    } catch (error: any) {
      console.log("ERROR_LISTEN_KEY_KEEP_ALIVE", {
        error: error?.response?.data || error?.message,
        market,
      });
      return false;
    }
  },

  // Connect to Binance user data stream WebSocket and handle execution reports
  async connect(
    clientId: string,
    credentials: CryptoExchangeCredentials,
    market: MarketType = "SPOT"
  ): Promise<BinanceUserDataStreamConnection> {
    const { apiKey, apiSecret } = credentials;
    const listenKey = await this.getListenKey(apiKey, market);
    const wsUrl = `${WS_URLS[market]}/${listenKey}`;

    console.log("CONNECTING_TO_BINANCE_WEBSOCKET", { market, wsUrl });
    const socket = new WebSocket(wsUrl);

    const keepAliveIntervalMs = 45 * 60 * 1000;
    const keepAliveInterval = setInterval(() => {
      this.keepAliveListenKey(apiKey, listenKey, market).catch((error) => {
        console.log("ERROR_KEEP_ALIVE_FAILED", {
          error:
            (error as any)?.data ||
            (error as any)?.response?.data ||
            (error as any).message,
          market,
        });
      });
    }, keepAliveIntervalMs);

    socket.on("open", () => {
      logEvent("CONNECTED", {
        clientId,
        market,
        exchange: CryptoExchange.BINANCE,
      });
    });

    socket.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());
        if (event.e === "ORDER_TRADE_UPDATE") {
          console.log("BINANCE_FUTURES_ORDER_UPDATE", { event });
          handleBinanceFutureOrderUpdate(event.o, clientId, {
            apiKey,
            apiSecret,
          });
        }

        if (event.e === "executionReport") {
          console.log("BINANCE_SPOT_ORDER_UPDATE", { event });

          enqueueBinanceTradeUpdate(
            event,
            clientId,
            handleBinanceSpotOrderUpdate
          );
        }
      } catch (err) {
        console.log("ERROR_PARSING_BINANCE_MESSAGE", {
          error:
            (err as any)?.data ||
            (err as any)?.response?.data ||
            (err as any).message,
        });
      }
    });

    socket.on("error", (error) => {
      console.log("BINANCE_WEBSOCKET_ERROR", {
        error:
          (error as any)?.data ||
          (error as any)?.response?.data ||
          (error as any).message,
      });
    });

    socket.on("close", (code, reason) => {
      logEvent("CLOSED", {
        clientId,
        market,
        exchange: CryptoExchange.BINANCE,
        code,
        reason: reason.toString(),
      });

      clearInterval(keepAliveInterval);
    });

    return {
      close: async () => {
        clearInterval(keepAliveInterval);
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }

        const deleteUrl = `${BASE_URLS[market]}/${
          market === "SPOT" ? "api/v3/userDataStream" : "fapi/v1/listenKey"
        }`;
        try {
          await fetch(deleteUrl, {
            method: "DELETE",
            headers: {
              "X-MBX-APIKEY": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ listenKey }),
          });
          console.log("BINANCE_LISTEN_KEY_DELETED", { market });
        } catch (error) {
          console.log("ERROR_DELETING_BINANCE_LISTEN_KEY", {
            error:
              (error as any)?.data ||
              (error as any)?.response?.data ||
              (error as any).message,
            market,
          });
        }
      },
    };
  },
};
