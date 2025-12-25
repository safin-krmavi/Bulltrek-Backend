import WebSocket from "ws";
import { StocksExchange } from "@prisma/client";
import { SocketManager } from "../../socketManagement";
import { logEvent } from "../../utils";

type KotakCredentials = {
  tradingToken: string;
  tradingSid: string;
  dataCenter: string; // Not used for HSM, but kept for consistency
};

/**
 * Build Kotak HSM (Market Data) WebSocket URL
 * HSM always uses the same production URL regardless of data center
 */
function buildKotakMarketWsUrl(): string {
  // Production HSM URL (from demo)
  return "wss://mlhsm.kotaksecurities.com";
  
  // UAT URL (requires VPN): "wss://qhsm.kotaksecurities.online"
}

/**
 * Build connection message for HSM
 * CRITICAL: HSM uses different field order than HSI!
 * HSM order: Authorization, Sid, type
 * Format: {Authorization:token,Sid:sid,type:cn}
 */
function buildConnectionMessage(credentials: KotakCredentials) {
  // HSM uses different order than HSI - Authorization and Sid come BEFORE type
  return `{Authorization:${credentials.tradingToken},Sid:${credentials.tradingSid},type:cn}`;
}

/**
 * Build throttling interval message
 * Sent every 30 seconds to keep connection alive
 * Format: {type:ti,scrips:}
 */
function buildThrottlingMessage() {
  return "{type:ti,scrips:}";
}

/**
 * Build scrip subscription message
 * @param scrips - Format: "nse_cm|11536&nse_cm|3045"
 * @param channelNum - Channel number (1-64)
 */
function buildScripSubscription(scrips: string, channelNum: number) {
  return `{type:mws,scrips:${scrips},channelnum:${channelNum}}`;
}

/**
 * Build scrip unsubscription message
 */
function buildScripUnsubscription(scrips: string, channelNum: number) {
  return `{type:mwu,scrips:${scrips},channelnum:${channelNum}}`;
}

/**
 * Build index subscription message
 */
function buildIndexSubscription(indices: string, channelNum: number) {
  return `{type:ifs,scrips:${indices},channelnum:${channelNum}}`;
}

/**
 * Build depth subscription message
 */
function buildDepthSubscription(scrips: string, channelNum: number) {
  return `{type:dps,scrips:${scrips},channelnum:${channelNum}}`;
}

export const KotakMarketDataHandler = {
  connect(
    userId: string,
    credentials: KotakCredentials,
    retryCount: number = 0
  ) {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = Math.min(1000 * Math.pow(2, retryCount), 30000);
    const THROTTLING_INTERVAL = 30000; // 30 seconds

    const wsUrl = buildKotakMarketWsUrl();

    console.log("[KOTAK][HSM] Connecting to Market Data Feed", {
      userId,
      wsUrl,
      attempt: retryCount + 1,
    });

    // Validate credentials
    if (!credentials.tradingToken || !credentials.tradingSid) {
      console.error("[KOTAK][HSM] Missing required credentials", { userId });
      return null;
    }

    const socket = new WebSocket(wsUrl, {
      handshakeTimeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": "https://neo.kotaksecurities.com",
      },
    });

    // Connection timeout
    const connectionTimeout = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) {
        console.error("[KOTAK][HSM] Connection timeout", { userId, wsUrl });
        socket.terminate();
      }
    }, 15000);

    // Throttling interval (keep-alive)
    let throttlingInterval: NodeJS.Timeout;
    let shouldRetry = true;

    socket.on("open", () => {
      clearTimeout(connectionTimeout);

      logEvent("CONNECTED", {
        userId,
        exchange: StocksExchange.KOTAK,
        market: "MARKET_DATA",
      });

      console.log("[KOTAK][HSM] ✓ WebSocket opened, sending handshake", {
        userId,
        wsUrl,
      });

      // Send connection handshake
      const connectionMsg = buildConnectionMessage(credentials);
      socket.send(connectionMsg);

      console.log("[KOTAK][HSM] Handshake sent", {
        userId,
        messageType: "cn",
      });

      // Start throttling interval (send "ti" message every 30 seconds)
      throttlingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          const throttleMsg = buildThrottlingMessage();
          socket.send(throttleMsg);
          console.log("[KOTAK][HSM] Throttling message sent", { userId });
        }
      }, THROTTLING_INTERVAL);
    });

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        console.log("[KOTAK][HSM] Message received", {
          userId,
          type: message.type,
          stat: message.stat,
        });

        // Handle connection acknowledgment
        if (message.type === "cn") {
          if (message.stat === "Ok") {
            console.log("[KOTAK][HSM] ✓ Connection established successfully", {
              userId,
              message,
            });
          } else {
            console.error("[KOTAK][HSM] ✗ Connection rejected", {
              userId,
              status: message.stat,
              message,
            });
          }
        }

        // Handle market data updates
        if (Array.isArray(message)) {
          // Market data comes as an array of tick data
          console.log("[KOTAK][HSM] Market data update", {
            userId,
            tickCount: message.length,
          });
          
          // Process each tick
          message.forEach((tick) => {
            if (tick.tk && tick.ltp) {
              console.log("[KOTAK][HSM] Price update", {
                userId,
                symbol: tick.tk,
                ltp: tick.ltp,
                exchange: tick.e,
              });
              // TODO: Update your market data store here
              // StockMarketDataManager.updatePrice("KOTAK", userId, tick.tk, tick.ltp);
            }
          });
        }

        // Handle subscription acknowledgment
        if (message.type === "sub") {
          console.log("[KOTAK][HSM] Subscription confirmed", {
            userId,
            status: message.stat,
            message: message.msg,
          });
        }

        // Handle unsubscription acknowledgment
        if (message.type === "unsub") {
          console.log("[KOTAK][HSM] Unsubscription confirmed", {
            userId,
            status: message.stat,
          });
        }

        // Handle errors
        if (message.stat === "NotOk" || message.type === "error") {
          console.error("[KOTAK][HSM] Server error", {
            userId,
            error: message.msg || message.message,
            stCode: message.stCode,
            fullMessage: message,
          });
        }
      } catch (err) {
        console.error("[KOTAK][HSM] Message parse error", {
          userId,
          error: err,
          raw: raw.toString().substring(0, 200),
        });
      }
    });

    socket.on("error", (err: any) => {
      clearTimeout(connectionTimeout);
      if (throttlingInterval) clearInterval(throttlingInterval);

      console.error("[KOTAK][HSM] WebSocket error", {
        userId,
        error: err.message,
        code: err.code,
        wsUrl,
        retryCount,
      });
    });

    socket.on("close", (code, reason) => {
      clearTimeout(connectionTimeout);
      if (throttlingInterval) clearInterval(throttlingInterval);

      const reasonStr = reason.toString();

      logEvent("CLOSED", {
        userId,
        exchange: StocksExchange.KOTAK,
        market: "MARKET_DATA",
        code,
        reason: reasonStr,
      });

      console.log("[KOTAK][HSM] WebSocket closed", {
        userId,
        code,
        reason: reasonStr,
        wsUrl,
        retryCount,
      });

      SocketManager.removeSocket(userId, StocksExchange.KOTAK, "MARKET_DATA");

      // Auto-reconnect on abnormal closure
      if (shouldRetry && code !== 1000 && code !== 1001 && retryCount < MAX_RETRIES) {
        console.log(
          `[KOTAK][HSM] Reconnecting in ${RETRY_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
          { userId }
        );

        setTimeout(() => {
          this.connect(userId, credentials, retryCount + 1);
        }, RETRY_DELAY);
      } else if (retryCount >= MAX_RETRIES) {
        console.error("[KOTAK][HSM] ✗ Max reconnection attempts reached", {
          userId,
          retryCount,
        });

        // After 5 retries, wait 5 minutes then reset
        console.log("[KOTAK][HSM] Will retry after 5 minutes cooldown", {
          userId,
        });
        setTimeout(() => {
          console.log("[KOTAK][HSM] Cooldown complete, attempting reconnection", {
            userId,
          });
          this.connect(userId, credentials, 0);
        }, 300000); // 5 minutes
      }
    });

    SocketManager.registerSocket(
      userId,
      StocksExchange.KOTAK,
      "MARKET_DATA",
      socket,
      "stock"
    );

    return socket;
  },

  /**
   * Subscribe to scrip (stock) updates
   * @param scrips - Format: "nse_cm|11536&nse_cm|3045"
   * @param channelNum - Channel number (1-64)
   */
  subscribeScrips(userId: string, scrips: string, channelNum: number = 1) {
    const socket = SocketManager.getSocket(
      userId,
      StocksExchange.KOTAK,
      "MARKET_DATA"
    ) as WebSocket | undefined;

    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = buildScripSubscription(scrips, channelNum);
      socket.send(message);
      console.log("[KOTAK][HSM] Subscribed to scrips", {
        userId,
        scrips,
        channelNum,
      });
    } else {
      console.error("[KOTAK][HSM] Cannot subscribe - socket not connected", {
        userId,
      });
    }
  },

  /**
   * Unsubscribe from scrip updates
   */
  unsubscribeScrips(userId: string, scrips: string, channelNum: number = 1) {
    const socket = SocketManager.getSocket(
      userId,
      StocksExchange.KOTAK,
      "MARKET_DATA"
    ) as WebSocket | undefined;

    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = buildScripUnsubscription(scrips, channelNum);
      socket.send(message);
      console.log("[KOTAK][HSM] Unsubscribed from scrips", {
        userId,
        scrips,
        channelNum,
      });
    }
  },

  /**
   * Subscribe to index updates
   * @param indices - Format: "nse_cm|Nifty 50&nse_cm|Bank Nifty"
   */
  subscribeIndices(userId: string, indices: string, channelNum: number = 1) {
    const socket = SocketManager.getSocket(
      userId,
      StocksExchange.KOTAK,
      "MARKET_DATA"
    ) as WebSocket | undefined;

    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = buildIndexSubscription(indices, channelNum);
      socket.send(message);
      console.log("[KOTAK][HSM] Subscribed to indices", {
        userId,
        indices,
        channelNum,
      });
    }
  },

  /**
   * Subscribe to market depth (Level 2 data)
   */
  subscribeDepth(userId: string, scrips: string, channelNum: number = 1) {
    const socket = SocketManager.getSocket(
      userId,
      StocksExchange.KOTAK,
      "MARKET_DATA"
    ) as WebSocket | undefined;

    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = buildDepthSubscription(scrips, channelNum);
      socket.send(message);
      console.log("[KOTAK][HSM] Subscribed to depth", {
        userId,
        scrips,
        channelNum,
      });
    }
  },

  /**
   * Manually disconnect
   */
  disconnect(userId: string) {
    const socket = SocketManager.getSocket(
      userId,
      StocksExchange.KOTAK,
      "MARKET_DATA"
    ) as WebSocket | undefined;

    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log("[KOTAK][HSM] Manually disconnecting", { userId });
      socket.close(1000, "Manual disconnect");
    }
  },
};