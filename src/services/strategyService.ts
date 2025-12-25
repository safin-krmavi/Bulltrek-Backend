// services/strategyService.ts
import prisma from "../config/db.config";
import { computeNextRunAt } from "../utils/scheduler/computeNextRunAt";
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
    // schedule inputs (already coming from controller)
    time,
    hourInterval,
    daysOfWeek,
    datesOfMonth,
  } = data;

  // Map flat fields into structured config
  const config = {
    capital: {
      perOrderAmount: investmentPerRun,
      maxCapital: investmentCap,
    },
    schedule: buildSchedule({
      frequency,
      time,
      hourInterval,
      daysOfWeek,
      datesOfMonth,
    }),

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
  const nextRunAt = computeNextRunAt(config.schedule);

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
      nextRunAt,
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

export const buildSchedule = (params: {
  frequency: string;
  time?: string;
  hourInterval?: number;
  daysOfWeek?: number[];
  datesOfMonth?: number[];
}) => {
  const { frequency, time, hourInterval, daysOfWeek, datesOfMonth } = params;

  switch (frequency) {
    case "HOURLY":
      if (!hourInterval) {
        throw new Error("hourInterval required for HOURLY frequency");
      }
      return {
        frequency: "HOURLY",
        hourly: {
          intervalHours: hourInterval,
          startTime: time,
        },
      };

    case "DAILY":
      if (!time) {
        throw new Error("time required for DAILY frequency");
      }
      return {
        frequency: "DAILY",
        daily: { time },
      };

    case "WEEKLY":
      if (!time || !daysOfWeek?.length) {
        throw new Error("daysOfWeek and time required for WEEKLY frequency");
      }
      return {
        frequency: "WEEKLY",
        weekly: {
          daysOfWeek,
          time,
        },
      };

    case "MONTHLY":
      if (!time || !datesOfMonth?.length) {
        throw new Error("datesOfMonth and time required for MONTHLY frequency");
      }
      return {
        frequency: "MONTHLY",
        monthly: {
          dates: datesOfMonth,
          time,
        },
      };

    default:
      throw new Error("Invalid frequency");
  }
};
