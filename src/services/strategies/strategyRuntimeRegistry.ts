import prisma from "../../config/db.config";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { StrategyRuntime } from "./strategyRuntime";
import { BinanceKlineHandler } from "../../sockets/crypto/marketData/binanceKlineHandler";
import { bootstrapCandles } from "../../sockets/crypto/marketData/candleBootstrap";
import { CandleBuffer } from "../../sockets/crypto/marketData/candleBuffer";
import { CryptoExchange, CryptoTradeType, Strategy } from "@prisma/client";

class StrategyRuntimeRegistry {
  private runtimes = new Map<string, StrategyRuntime>();

  async bootstrap() {
    console.log("[STRATEGY_RUNTIME_BOOTSTRAP]");

    const strategies = await prisma.strategy.findMany({
      where: { status: "ACTIVE" },
    });

    console.log("[STRATEGY_BOOTSTRAP_FOUND]", { count: strategies.length });

    for (const strategy of strategies) {
      this.register(strategy); // register runtime first
      await MarketDataManager.subscribe(
        strategy.exchange as CryptoExchange,
        strategy.segment as CryptoTradeType,
        strategy.symbol,
        strategy.id
      );
    }

    console.log("[STRATEGY_BOOTSTRAP_DONE]");
  }

  async register(strategy: Strategy) {
    console.log("[STRATEGY_REGISTER]", {
      strategyId: strategy.id,
      symbol: strategy.symbol,
      exchange: strategy.exchange,
      segment: strategy.segment,
      type: strategy.type,
    });

    if (this.runtimes.has(strategy.id)) return;

    const runtime = new StrategyRuntime(strategy);
    this.runtimes.set(strategy.id, runtime);

    // ✅ Bootstrap candles and subscribe to kline stream for UTC strategies
    if (strategy.type === "UTC" && strategy.exchange === "BINANCE") {
      try {
        const config = strategy.config as any;
        const timeframe = config.timeFrame || "5m";

        console.log("[UTC_BOOTSTRAP] Starting", {
          strategyId: strategy.id,
          symbol: strategy.symbol,
          timeframe,
        });

        // Bootstrap historical candles
        await bootstrapCandles({
          exchange: strategy.exchange,
          segment: strategy.segment as any,
          symbol: strategy.symbol,
          timeframe,
          limit: 500,
        });

        // Subscribe to kline stream
        await BinanceKlineHandler.connect(
          strategy.segment as any,
          strategy.symbol,
          timeframe
        );

        // Listen for candle close events
        const candleCloseHandler = (data: any) => {
          if (
            data.exchange === strategy.exchange &&
            data.segment === strategy.segment &&
            data.symbol === strategy.symbol
          ) {
            console.log("[UTC_CANDLE_CLOSE] Triggering evaluation", {
              strategyId: strategy.id,
              symbol: data.symbol,
              time: new Date(data.candle.time).toISOString(),
              close: data.candle.close,
            });

            // Get all candles from buffer
            const candles = CandleBuffer.getCandles(
              data.exchange,
              data.segment,
              data.symbol
            );

            // Trigger UTC evaluation with candle data
            runtime.onCandleClose(data.candle.close, Date.now(), candles);
          }
        };

        BinanceKlineHandler.on("candleClose", candleCloseHandler);

        // Store handler reference for cleanup
        (runtime as any).candleCloseHandler = candleCloseHandler;

        console.log("[UTC_BOOTSTRAP] Complete", {
          strategyId: strategy.id,
          candleCount: CandleBuffer.getCandleCount(
            strategy.exchange,
            strategy.segment,
            strategy.symbol
          ),
        });
      } catch (error: any) {
        console.error("[UTC_BOOTSTRAP] Error", {
          strategyId: strategy.id,
          error: error.message,
          stack: error.stack,
        });
      }
    }
  }
  getRuntime(strategyId: string) {
    return this.runtimes.get(strategyId);
  }
  getAllRuntimes() {
    return Array.from(this.runtimes.values());
  }

  async onMarketTick({
    strategyId,

    price,
    timestamp,
  }: {
    strategyId: string;

    price: number;
    timestamp: number;
  }) {
    const runtime = this.runtimes.get(strategyId);
    if (!runtime) {
      console.warn("[STRATEGY_RUNTIME_MISSING_AUTO_REGISTER]", { strategyId });
      const strategy = await prisma.strategy.findUnique({
        where: { id: strategyId },
      });
      if (!strategy) return;
      this.register(strategy);
      this.runtimes.get(strategyId)?.onMarketTick(price, timestamp); // forward current tick
      return;
    }

    // console.log("[STRATEGY_TICK_DISPATCH]", {
    //   strategyId,
    //   symbol,
    //   price,
    // });

    runtime.onMarketTick(price, timestamp);
  }

  remove(strategyId: string) {
    const existed = this.runtimes.delete(strategyId);

    if (existed) {
      console.log("[STRATEGY_RUNTIME_REMOVED]", { strategyId });
    } else {
      console.warn("[STRATEGY_RUNTIME_REMOVE_MISS]", { strategyId });
    }
  }
}

export const strategyRuntimeRegistry = new StrategyRuntimeRegistry();
