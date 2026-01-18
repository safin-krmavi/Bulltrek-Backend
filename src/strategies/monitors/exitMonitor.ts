import { Strategy } from "@prisma/client";
import prisma from "../../config/db.config";
import { tradeDispatcher } from "../../services/strategies/tradeDispatcher";

// -------------------- Runtime State --------------------
// Keeps track of open positions per strategy in memory.
// Disposable, rebuildable on restart.
type Position = {
  tradeId: string;
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  quantity: number;
  segment: "CRYPTO" | "STOCK";
  exchange: string;
  tradeType: "SPOT" | "FUTURES";
  takeProfit?: number;
  stopLoss?: number;
};

const openPositions: Map<string, Position[]> = new Map();

// -------------------- Exit Monitor --------------------
export const exitMonitor = {
  register(strategy: Strategy) {
    if (!openPositions.has(strategy.id)) {
      openPositions.set(strategy.id, []);
    }
  },

  unregister(strategyId: string) {
    openPositions.delete(strategyId);
  },

  // Called by engines when a BUY is executed
  async trackPosition(strategyId: string, trade: Position) {
    await prisma.strategyPosition.create({
      data: {
        strategyId,
        userId: trade.userId,
        symbol: trade.symbol,
        exchange: trade.exchange,
        assetType: trade.segment,
        tradeType: trade.tradeType,
        side: "BUY",
        entryPrice: trade.entryPrice,
        quantity: trade.quantity,
        takeProfit: trade.takeProfit,
        stopLoss: trade.stopLoss,
        status: "OPEN",
      },
    });
    // const positions = openPositions.get(strategyId);
    // if (!positions) return;
    // positions.push(trade);
  },

  // Called periodically or on market tick
  async evaluate(strategyId: string, currentPrice: number) {
    const positions = await prisma.strategyPosition.findMany({
      where: {
        strategyId,
        status: "OPEN",
      },
    });

    // const positions = openPositions.get(strategyId);
    if (!positions || positions.length === 0) return;

    for (const pos of positions) {
      let sellReason: "TAKE_PROFIT" | "STOP_LOSS" | null = null;
      if (pos.takeProfit && currentPrice >= pos.takeProfit)
        sellReason = "TAKE_PROFIT";
      else if (pos.stopLoss && currentPrice <= pos.stopLoss)
        sellReason = "STOP_LOSS";
      if (!sellReason) continue;

      await tradeDispatcher.dispatch({
        userId: pos.userId,
        exchange: pos.exchange,
        segment: pos.assetType as "CRYPTO" | "STOCK",
        tradeType: pos.tradeType as "SPOT" | "FUTURES",
        symbol: pos.symbol,
        side: "SELL",
        quantity: pos.quantity,
        price: currentPrice,
        orderType: "MARKET",
        takeProfit: pos.takeProfit,
        stopLoss: pos.stopLoss,
        strategyId,
        //   metadata: { reason: sellReason },
        onComplete: () => {
          // nothing here, position removed from map
        },
      });

      await prisma.strategyPosition.update({
        where: { id: pos.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
        },
      });

      console.log("[EXIT_MONITOR_SELL]", {
        strategyId,
        symbol: pos.symbol,
        reason: sellReason,
        price: currentPrice,
      });
    }
  },

  async getInvestedCapital(strategyId: string): Promise<number> {
    const positions = await prisma.strategyPosition.findMany({
      where: {
        strategyId,
        status: "OPEN",
      },
      select: {
        entryPrice: true,
        quantity: true,
      },
    });

    return positions.reduce((sum, p) => sum + p.entryPrice * p.quantity, 0);
  },
  async canAllocate(
    strategyId: string,
    amount: number,
    maxCapital: number,
  ): Promise<boolean> {
    const invested = await this.getInvestedCapital(strategyId);
    return invested + amount <= maxCapital;
  },
};
