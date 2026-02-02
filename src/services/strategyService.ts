// services/strategyService.ts
import { CryptoExchange, StocksExchange } from "@prisma/client";
import prisma from "../config/db.config";
import { MarketDataManager } from "../sockets/crypto/marketData/marketDataManager";
import { StockMarketDataManager } from "../sockets/stocks/marketData/marketDataManager";
import { computeNextRunAt } from "../utils/scheduler/computeNextRunAt";
import {
  generateGridLevels,
  validateGridConfig,
  generateSmartGridLevels,
  validateSmartGridConfig,
  calculateBollingerBands,
  calculateATR,
} from "../utils/strategies/gridCalculations";

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
    time,
    hourInterval,
    daysOfWeek,
    datesOfMonth,
    executionMode,
    lowerLimit,
    upperLimit,
    entryInterval,
    bookProfitBy,
    leverage,
    direction,
    levels,
    profitPercentage,
    dataSetDays,
    gridMode,
    recalculationInterval,
  } = data;

  let config: any;
  let nextRunAt: Date | null = null;

  if (strategyType === "SMART_GRID") {
    // ✅ UPDATED: Auto-generate if limits not provided
    const { generateSmartGridParams } = await import(
      "./strategies/indicatorCalculator.js"
    );

    console.log("[SMART_GRID_CREATE] Generating parameters", {
      symbol,
      dataSetDays,
      userOverrides: {
        lowerLimit,
        upperLimit,
        levels,
      },
    });

    const autoParams = await generateSmartGridParams({
      exchange,
      symbol,
      dataSetDays: dataSetDays || 30,
      userLowerLimit: lowerLimit, // ✅ Optional - will auto-generate if undefined
      userUpperLimit: upperLimit, // ✅ Optional - will auto-generate if undefined
      userLevels: levels,
    });

    const smartGridConfig = {
      lowerLimit: autoParams.lowerLimit, // ✅ Always set (auto or user)
      upperLimit: autoParams.upperLimit, // ✅ Always set (auto or user)
      levels: autoParams.levels,
      profitPercentage,
      stopLossPercentage: stopLossPct,
      capital: {
        perGridAmount: investmentPerRun,
        maxCapital: investmentCap,
      },
      leverage: segment === "FUTURES" ? leverage : undefined,
      direction: segment === "FUTURES" ? direction : undefined,
      dataSetDays: autoParams.dataSetDays,
      mode: gridMode || "STATIC",
      recalculationInterval: recalculationInterval || 15,
    };

    const validation = validateSmartGridConfig(smartGridConfig);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const validation = validateSmartGridConfig(smartGridConfig);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const grids = generateSmartGridLevels(smartGridConfig);
    const grids = generateSmartGridLevels(smartGridConfig);

    config = {
      ...smartGridConfig,
      grids,
      indicators: autoParams.indicators, // ✅ Includes risk level & all metrics
    };

    nextRunAt = null;

    console.log("[SMART_GRID_CONFIG_COMPLETE]", {
      range: `${config.lowerLimit} - ${config.upperLimit}`,
      levels: config.levels,
      riskLevel: config.indicators.riskLevel,
      gridCount: grids.length,
    });
  } else if (strategyType === "HUMAN_GRID") {
    const gridConfig = {
      lowerLimit,
      upperLimit,
      entryInterval,
      bookProfitBy,
      stopLossPercentage: stopLossPct,
      capital: {
        perGridAmount: investmentPerRun,
        maxCapital: investmentCap,
      },
      leverage: segment === "FUTURES" ? leverage : undefined,
      direction: segment === "FUTURES" ? direction : undefined,
    };

    const validation = validateGridConfig(gridConfig);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const grids = generateGridLevels(gridConfig);
    config = {
      ...gridConfig,
      grids,
    };
    nextRunAt = null;
  } else {
    // Existing Growth DCA logic
    config = {
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
    nextRunAt = computeNextRunAt(config.schedule);
  }

  return prisma.strategy.create({
    data: {
      userId,
      name,
      type: strategyType,
      assetType,
      exchange,
      segment,
      symbol,
      config,
      nextRunAt,
      status: "ACTIVE",
      executionMode,
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

export const updateStrategy = async (
  strategyId: string,
  userId: string,
  updates: any,
) => {
  const existing = await prisma.strategy.findFirst({
    where: { id: strategyId, userId },
  });

  if (!existing) {
    throw new Error("Strategy not found");
  }

  if (existing.status === "STOPPED") {
    throw new Error("Stopped strategies cannot be updated");
  }

  const {
    name,
    status,
    investmentPerRun,
    investmentCap,
    frequency,
    time,
    hourInterval,
    daysOfWeek,
    datesOfMonth,
    takeProfitPct,
    stopLossPct,
    priceStart,
    priceStop,
  } = updates;

  let config = existing.config as any;
  let nextRunAt = existing.nextRunAt;

  // Capital update
  if (investmentPerRun || investmentCap) {
    config.capital = {
      perOrderAmount: investmentPerRun ?? config.capital.perOrderAmount,
      maxCapital: investmentCap ?? config.capital.maxCapital,
    };

    if (config.capital.perOrderAmount > config.capital.maxCapital) {
      throw new Error("Per order amount cannot exceed max capital");
    }
  }

  // Schedule update
  if (frequency) {
    config.schedule = buildSchedule({
      frequency,
      time,
      hourInterval,
      daysOfWeek,
      datesOfMonth,
    });
    nextRunAt = computeNextRunAt(config.schedule);
  }

  // Entry / Exit / Risk updates
  config.entry.priceTrigger = {
    enabled: priceStart !== undefined && priceStop !== undefined,
    startPrice: priceStart,
    stopPrice: priceStop,
  };

  config.exit.bookProfit = {
    enabled: takeProfitPct !== undefined,
    percentage: takeProfitPct,
  };

  config.risk.stopLoss = {
    enabled: stopLossPct !== undefined,
    percentage: stopLossPct,
  };

  return prisma.strategy.update({
    where: { id: strategyId },
    data: {
      name,
      status,
      config,
      nextRunAt,
    },
  });
};

export const deleteStrategy = async (strategyId: string, userId: string) => {
  const existing = await prisma.strategy.findFirst({
    where: { id: strategyId, userId },
  });

  if (!existing) {
    throw new Error("Strategy not found");
  }

  return prisma.strategy.delete({
    where: { id: strategyId },
  });
};

export const changeStrategyStatus = async (
  strategyId: string,
  userId: string,
  status: "ACTIVE" | "PAUSED" | "STOPPED",
) => {
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, userId },
  });

  if (!strategy) {
    throw new Error("Strategy not found");
  }

  let nextRunAt = strategy.nextRunAt;

  if (status === "ACTIVE") {
    nextRunAt = computeNextRunAt((strategy.config as any).schedule);
  }

  if (status !== "ACTIVE") {
    nextRunAt = null;
  }

  return prisma.strategy.update({
    where: { id: strategyId },
    data: {
      status,
      nextRunAt,
    },
  });
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
