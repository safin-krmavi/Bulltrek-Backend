import prisma from "../../config/db.config";
import { MarketDataManager } from "../../sockets/crypto/marketData/marketDataManager";
import { StrategyRuntime } from "./strategyRuntime";
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

  register(strategy: Strategy) {
    console.log("[STRATEGY_REGISTER]", {
      strategyId: strategy.id,
      symbol: strategy.symbol,
      exchange: strategy.exchange,
      segment: strategy.segment,
    });
    const runtime = new StrategyRuntime(strategy);
    this.runtimes.set(strategy.id, runtime);
  }

  onMarketTick({
    strategyId,
    exchange,
    segment,
    symbol,
    price,
    timestamp,
  }: {
    strategyId: string;
    exchange: string;
    segment: CryptoTradeType;
    symbol: string;
    price: number;
    timestamp: number;
  }) {
    const runtime = this.runtimes.get(strategyId);
    if (!runtime) {
      console.warn("[STRATEGY_RUNTIME_NOT_FOUND]", {
        strategyId,
      });
      return;
    }
    
    // console.log("[STRATEGY_TICK_DISPATCH]", {
    //   strategyId,
    //   symbol,
    //   price,
    // });

    runtime.onMarketTick(price, timestamp);
  }
}

export const strategyRuntimeRegistry = new StrategyRuntimeRegistry();
