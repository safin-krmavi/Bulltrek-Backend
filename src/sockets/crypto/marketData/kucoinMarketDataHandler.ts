import WebSocket from "ws";
import { MarketDataManager } from "./marketDataManager";
import { CryptoTradeType } from "@prisma/client";
import axios from "axios";

// KuCoin requires a token to connect
async function getKuCoinToken(segment: CryptoTradeType) {
  const url =
    segment === CryptoTradeType.SPOT
      ? "https://api.kucoin.com/api/v1/bullet-public"
      : "https://futures.kucoin.com/api/v1/bullet-public";
  const response = await axios.post(url, { type: "public" });
  const data = response.data?.data;
  if (!data) throw new Error("Failed to get KuCoin token");
  return data;
}

export const KuCoinMarketDataHandler = {
  async connect(segment: CryptoTradeType) {
    try {
      const tokenData = await getKuCoinToken(segment);

      const wsUrl = `${tokenData.instanceServers[0].endpoint}?token=${
        tokenData.token
      }&connectId=${Date.now()}`;
      const ws = new WebSocket(wsUrl);

      ws.on("open", () => {
        console.log("KUCOIN_SOCKET_OPEN", { segment });

        // Subscribe to all tickers (all-market)
        const topic =
          segment === CryptoTradeType.SPOT
            ? "/market/ticker:all"
            : "/contractMarket/ticker:all"; // futures

        ws.send(
          JSON.stringify({
            id: Date.now(),
            type: "subscribe",
            topic,
            privateChannel: false,
            response: true,
          })
        );
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          // Ignore ping, respond with pong
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ id: Date.now(), type: "pong" }));
            return;
          }

          // Handle ticker updates
          if (msg.type === "message" && msg.subject === "trade.ticker") {
            const tick = msg.data;
            const symbol = tick.symbol.toUpperCase();
            const ltp = parseFloat(tick.price || tick.lastTradedPrice);
            if (!ltp) return;

            MarketDataManager.updatePrice("KUCOIN", segment, symbol, ltp);
          }

          // Some messages may have array of tickers
          if (msg.type === "message" && Array.isArray(msg.data)) {
            for (const tick of msg.data) {
              const symbol = tick.symbol.toUpperCase();
              const ltp = parseFloat(tick.price || tick.lastTradedPrice);
              if (!ltp) continue;
              MarketDataManager.updatePrice("KUCOIN", segment, symbol, ltp);
            }
          }
        } catch (err) {
          console.log("KUCOIN_SOCKET_PARSE_ERROR", segment, err);
        }
      });

      ws.on("close", () => {
        console.log("KUCOIN_SOCKET_CLOSED", { segment });
        // optional: reconnect logic here
      });

      ws.on("error", (err) => {
        console.log("KUCOIN_SOCKET_ERROR", { segment, err });
      });

      MarketDataManager.registerSocket("KUCOIN", segment, ws);
    } catch (err) {
      console.log("KUCOIN_HANDLER_INIT_ERROR", segment, err);
    }
  },
};
