// services/strategyService.ts
import prisma from "../config/db.config";
export const createStrategy = async (data: any) => {
  const { 
    userId, 
    name, 
    strategyType, 
    assetType, 
    exchange, 
    segment, 
    symbol,
    investmentPerRun,
    investmentCap,
    frequency,
    takeProfitPct,
    stopLossPct,
    priceStart,
    priceStop,
  } = data;

  // Map flat fields into structured config
  const config = {
    capital: {
      perOrderAmount: investmentPerRun,
      maxCapital: investmentCap,
    },
    schedule: {
      frequency,
    },
    entry: {
      priceTrigger: {
        enabled: priceStart !== undefined && priceStop !== undefined,
        startPrice: priceStart,
        stopPrice: priceStop,
      },
    },
    exit: {
      bookProfit: {
        enabled: takeProfitPct !== undefined,
        percentage: takeProfitPct,
      },
    },
    risk: {
      stopLoss: {
        enabled: stopLossPct !== undefined,
        percentage: stopLossPct,
      },
    },
  };

  // Optional validation
  if (config.capital.perOrderAmount > config.capital.maxCapital) {
    throw new Error("Per order amount cannot exceed max capital");
  }

  // Create strategy in DB
  return prisma.strategy.create({
    data: {
      userId,
      name,
      type: strategyType,
      assetType,
      exchange,
      segment,
      symbol,
      config, // store structured config
      status: "ACTIVE",
    },
  });
};


export const getUserStrategies = async (userId: string) => {
  console.log("[STRATEGY_SERVICE] Fetching strategies for user", userId);

  const strategies = await prisma.strategy.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  console.log("[STRATEGY_SERVICE] Strategies fetched:", strategies.length);
  return strategies;
};

export const getStrategyById = async (strategyId: string) => {
  console.log("[STRATEGY_SERVICE] Fetching strategy", strategyId);

  const strategy = await prisma.strategy.findUnique({
    where: { id: strategyId },
  });

  if (!strategy) {
    console.warn("[STRATEGY_SERVICE] Strategy not found", strategyId);
    throw { code: "NOT_FOUND", message: "Strategy not found" };
  }

  return strategy;
};
