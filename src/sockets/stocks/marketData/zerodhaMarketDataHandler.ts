// zerodhaMarketDataHandler.ts
import { KiteTicker } from "kiteconnect";
import { instrumentTokenToSymbol } from "../../../utils/stocks/exchange/instrumentTokenMap";
import { SocketManager } from "../../socketManagement";
import { StocksExchange } from "@prisma/client";
import { StockMarketDataManager } from "./marketDataManager";
import { loadZerodhaInstrumentTokensFromFile } from "../../../services/stocks/exchange/instrumentTokenService";

type ZerodhaConnectParams = {
  userId: string;
  apiKey: string;
  accessToken: string;
  instrumentTokens: number[];
};

export const ZerodhaMarketDataHandler = {
  async connect({
    userId,
    apiKey,
    accessToken,
  }: Omit<ZerodhaConnectParams, "instrumentTokens">) {
    const instrumentTokens = await loadZerodhaInstrumentTokensFromFile();

    const ticker = new KiteTicker({
      api_key: apiKey,
      access_token: accessToken,
    });

    ticker.on("connect", () => {
      console.log("ZERODHA_SOCKET_OPEN", { userId });
      ticker.subscribe(instrumentTokens);
      ticker.setMode(ticker.modeLTP, instrumentTokens);
    });

    ticker.on("ticks", (ticks: any[]) => {
      for (const tick of ticks) {
        const token = tick.instrument_token;
        const ltp = tick.last_price;
        if (!ltp) continue;

        const symbol = instrumentTokenToSymbol[token];
        if (!symbol) continue;

        StockMarketDataManager.updatePrice("ZERODHA", userId, symbol, ltp);
      }
    });

    ticker.on("reconnect", (attempt, delay) =>
      console.log("ZERODHA_RECONNECT", { userId, attempt, delay })
    );
    ticker.on("noreconnect", () =>
      StockMarketDataManager.disconnect("ZERODHA", userId)
    );
    ticker.on("disconnect", () =>
      console.log("ZERODHA_DISCONNECTED", { userId })
    );
    ticker.on("error", (err: any) => {
      console.log("ZERODHA_ERROR", { userId, err });
      if (
        err?.message?.includes("TokenException") ||
        err?.message?.includes("Invalid session")
      ) {
        StockMarketDataManager.disconnect("ZERODHA", userId);
      }
    });
    ticker.on("close", () => console.log("ZERODHA_CLOSED", { userId }));

    ticker.connect();

    StockMarketDataManager.registerSocket("ZERODHA", userId, ticker);
    SocketManager.registerSocket(
      userId,
      "ZERODHA",
      "STOCK",
      ticker as any,
      "stock"
    );
  },
};
