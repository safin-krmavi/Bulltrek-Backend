import WebSocket from "ws";
import { StocksExchange } from "@prisma/client";
import {
  handleKotakOrderUpdate,
  handleKotakTradeUpdate,
} from "../../../services/stocks/exchangeSocketServices/kotakSocketService";
import { SocketManager } from "../../socketManagement";
import { logEvent } from "../../utils";
import { enqueueKotakTradeUpdate } from "../queues/kotakOrderQueue";

type KotakCredentials = {
  tradingToken: string; // session token from login API
  tradingSid: string; // sid from login API
  dataCenter: string; // e21, e22, e41, e43, adc, mis
};

/**
 * Build Kotak Neo HSI (Order Feed) WebSocket URL
 * Based on official Kotak Neo demo implementation
 */
function buildKotakOrderWsUrl(dataCenter: string): string {
  const dc = dataCenter.toLowerCase();

  // Map data centers to their WebSocket URLs
  // Source: Kotak Neo Demo.js connectHsi() function
  switch (dc) {
    case "adc":
      return "wss://cis.kotaksecurities.com/realtime";
    case "e21":
      return "wss://e21.kotaksecurities.com/realtime";
    case "e22":
      return "wss://e22.kotaksecurities.com/realtime";
    case "e41":
      return "wss://e41.kotaksecurities.com/realtime";
    case "e43":
      return "wss://e43.kotaksecurities.com/realtime";
    case "mis":
    default:
      return "wss://mis.kotaksecurities.com/realtime";
  }
}

/**
 * Build connection message for Kotak Neo HSI WebSocket
 * CRITICAL: Kotak's HSIWebSocket removes ALL quotes from JSON
 * So we need to send it WITHOUT quotes, but Node.js WebSocket requires a string
 * Format: {type:cn,Authorization:token,Sid:sid,src:WEB}
 */
function buildConnectionMessage(credentials: KotakCredentials) {
  // Build the message string WITHOUT quotes (as HSIWebSocket does)
  // Note: Using 'src' not 'source' based on the library code
  return `{type:cn,Authorization:${credentials.tradingToken},Sid:${credentials.tradingSid},src:WEB}`;
}

/**
 * Build heartbeat message (sent every 30 seconds)
 * Format: {type:hb} (no quotes)
 */
function buildHeartbeatMessage() {
  return "{type:hb}";
}
export const KotakOrderHandler = {
  async connect(
    userId: string,
    credentials: KotakCredentials,
    retryCount: number = 0
  ) {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = Math.min(1000 * Math.pow(2, retryCount), 30000);
    const HEARTBEAT_INTERVAL = 30000; // 30 seconds

    const wsUrl = buildKotakOrderWsUrl(credentials.dataCenter);

    console.log("[KOTAK][HSI] Connecting to Order Feed", {
      userId,
      wsUrl,
      dataCenter: credentials.dataCenter,
      attempt: retryCount + 1,
    });

    if (
      !credentials.tradingToken ||
      !credentials.tradingSid ||
      !credentials.dataCenter
    ) {
      console.error("[KOTAK][HSI] Missing required credentials", { userId });
      return null;
    }

    const socket = new WebSocket(wsUrl, {
      handshakeTimeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Origin: "https://neo.kotaksecurities.com",
        "Sec-WebSocket-Protocol": "json",
        "Sec-WebSocket-Version": "13",
      },
      protocolVersion: 13,
    });

    const connectionTimeout = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) {
        console.error("[KOTAK][HSI] Connection timeout", { userId, wsUrl });
        socket.terminate();
      }
    }, 15000);

    let heartbeatInterval: NodeJS.Timeout;
    let shouldRetry = true;

    socket.on("open", () => {
      clearTimeout(connectionTimeout);

      logEvent("CONNECTED", {
        userId,
        exchange: StocksExchange.KOTAK,
        market: "ORDERS",
      });

      console.log("[KOTAK][HSI] ✓ WebSocket opened, sending handshake", {
        userId,
        wsUrl,
      });

      const connectionMsg = buildConnectionMessage(credentials);

      console.log("[KOTAK][HSI] Credentials being sent", {
        userId,
        tokenLength: credentials.tradingToken?.length,
        tokenPrefix: credentials.tradingToken?.substring(0, 10) + "...",
        sidLength: credentials.tradingSid?.length,
        sidPrefix: credentials.tradingSid?.substring(0, 10) + "...",
        dataCenter: credentials.dataCenter,
      });

      // Send handshake directly, do NOT parse
      socket.send(connectionMsg);

      console.log("[KOTAK][HSI] Handshake sent", { userId, messageType: "cn" });

      heartbeatInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(buildHeartbeatMessage());
          console.log("[KOTAK][HSI] Heartbeat sent", { userId });
        }
      }, HEARTBEAT_INTERVAL);
    });

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        console.log("KOTAK MESSAGE: ", message);
        // KOTAK MESSAGE:  {
        //   type: 'order',
        //   data: {
        //     avgPrc: '0.00',
        //     brdLtQty: '1',
        //     dscQty: 0,
        //     exOrdId: 'NA',
        //     expDt: 'NA',
        //     exSeg: 'nse_cm',
        //     fldQty: 0,
        //     hsUpTm: '2026/01/04 11:22:33',
        //     lotSz: '1',
        //     mfdBy: 'NA',
        //     mktPro: '0.00',
        //     multiplier: '1',
        //     nOrdNo: '260104000001926',
        //     optTp: 'XX',
        //     ordDtTm: '04-Jan-2026 11:22:33',
        //     ordGenTp: 'NA',
        //     ordSt: 'rejected',
        //     ordValDt: 'NA',
        //     prc: '1.00',
        //     prcTp: 'L',
        //     precision: '2',
        //     prod: 'CNC',
        //     qty: 1,
        //     rejRsn: 'Adapter is Logged Off',
        //     reqId: '1',
        //     series: 'EQ',
        //     stkPrc: '0.00',
        //     sym: 'ITBEES',
        //     symOrdId: 'NA',
        //     tok: '19084',
        //     trdSym: 'ITBEES-EQ',
        //     trgPrc: '0.00',
        //     trnsTp: 'B',
        //     unFldSz: 0,
        //     usrId: 'BCYPJ1833P',
        //     vldt: 'DAY',
        //     updRecvTm: 1767505953317073000,
        //     boeSec: 1767505953,
        //     uSec: '1767505953',
        //     strategyCode: 'NA',
        //     GuiOrdId: 'XYKJV-b481a6a8-c995-4602-b84e-987d909c56e1',
        //     actId: 'XYKJV',
        //     ordSrc: 'ADMINCPPAPI_NEOTRADEAPI',
        //     exCfmTm: 'NA',
        //     it: 'EQ'
        //   }
        // }
        if (message.type === "order") {
          enqueueKotakTradeUpdate(message, userId, handleKotakOrderUpdate);
        }

        // handle messages here (order, trade, error, etc.)
      } catch (err) {
        console.error("[KOTAK][HSI] Message parse error", {
          userId,
          error: err,
          raw: raw.toString().substring(0, 200),
        });
      }
    });

    socket.on("error", (err: any) => {
      clearTimeout(connectionTimeout);
      if (heartbeatInterval) clearInterval(heartbeatInterval);

      console.error("[KOTAK][HSI] WebSocket error", {
        userId,
        error: err.message,
        code: err.code,
        wsUrl,
        retryCount,
      });
    });

    socket.on("close", (code, reason) => {
      clearTimeout(connectionTimeout);
      if (heartbeatInterval) clearInterval(heartbeatInterval);

      const reasonStr = reason.toString();

      logEvent("CLOSED", {
        userId,
        exchange: StocksExchange.KOTAK,
        market: "ORDERS",
        code,
        reason: reasonStr,
      });

      console.log("[KOTAK][HSI] WebSocket closed", {
        userId,
        code,
        reason: reasonStr,
        wsUrl,
        retryCount,
      });

      SocketManager.removeSocket(userId, StocksExchange.KOTAK, "ORDERS");

      if (
        shouldRetry &&
        code !== 1000 &&
        code !== 1001 &&
        retryCount < MAX_RETRIES
      ) {
        console.log(
          `[KOTAK][HSI] Reconnecting in ${RETRY_DELAY}ms (attempt ${
            retryCount + 1
          }/${MAX_RETRIES})`,
          { userId }
        );
        setTimeout(
          () => this.connect(userId, credentials, retryCount + 1),
          RETRY_DELAY
        );
      } else if (retryCount >= MAX_RETRIES) {
        console.error("[KOTAK][HSI] ✗ Max reconnection attempts reached", {
          userId,
          retryCount,
        });
        setTimeout(() => this.connect(userId, credentials, 0), 300000);
      }
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

  disconnect(userId: string) {
    const socket = SocketManager.getSocket(
      userId,
      StocksExchange.KOTAK,
      "ORDERS"
    ) as WebSocket | undefined;
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log("[KOTAK][HSI] Manually disconnecting", { userId });
      socket.close(1000, "Manual disconnect");
    }
  },
};
