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
    // Smart Grid new fields
    type,
    levels,
    profitPercentage,
    dataSetDays,
    gridMode,
    recalculationInterval,
    investment,
    minimumInvestment,
    perGridAmount, // ✅ NEW: User-editable perGridAmount
    // UTC new fields
    timeFrame,
    utcUpperLimit,
    utcLowerLimit,
  } = data;

  let config: any;
  let nextRunAt: Date | null = null;

  if (strategyType === "SMART_GRID") {
    const { generateSmartGridParams } = await import(
      "./strategies/indicatorCalculator.js"
    );

    console.log("[SMART_GRID_CREATE] Generating parameters", {
      exchange,
      segment,
      symbol,
      dataSetDays,
      type,
      investment,
      minimumInvestment,
      perGridAmount, // ✅ NEW
      userOverrides: {
        lowerLimit,
        upperLimit,
        levels,
        profitPercentage,
        perGridAmount, // ✅ NEW
      },
    });

    // ✅ Generate complete configuration with new parameters
    const autoParams = await generateSmartGridParams({
      exchange,
      symbol,
      dataSetDays: dataSetDays || 30,
      segment: segment as "SPOT" | "FUTURES",
      investment, // Legacy parameter for backward compatibility
      minimumInvestment, // Legacy parameter
      // ✅ User overrides
      userLowerLimit: lowerLimit,
      userUpperLimit: upperLimit,
      userLevels: levels,
      userProfitPercentage: profitPercentage,
      // ✅ NEW: Additional user overrides
      userPerGridAmount: perGridAmount,
      userInvestment: investment, // Explicit user investment
      userMinInvestment: minimumInvestment, // Explicit user min investment
    });

    const smartGridConfig = {
      type: type || "NEUTRAL",
      lowerLimit: autoParams.lowerLimit,
      upperLimit: autoParams.upperLimit,
      levels: autoParams.levels,
      profitPercentage: autoParams.profitPercentage,
      stopLossPercentage: stopLossPct,
      investment: autoParams.investment,
      minimumInvestment: autoParams.minimumInvestment,
      capital: {
        perGridAmount: autoParams.perGridAmount, // ✅ Use calculated perGridAmount
        maxCapital: autoParams.investment,
      },
      leverage: segment === "FUTURES" ? leverage : undefined,
      direction: segment === "FUTURES" ? direction : undefined,
      dataSetDays: autoParams.dataSetDays,
      mode: gridMode || "STATIC",
      recalculationInterval: recalculationInterval || 15,
    };

    const validation = validateSmartGridConfig(smartGridConfig);
    if (!validation.valid) {
      throw new Error(`Smart Grid validation failed: ${validation.error}`);
    }

    const grids = generateSmartGridLevels(smartGridConfig);

    config = {
      ...smartGridConfig,
      grids,
      indicators: autoParams.indicators,
    };

    nextRunAt = null;

    console.log("[SMART_GRID_CONFIG_COMPLETE]", {
      type: config.type,
      segment,
      range: `${config.lowerLimit} - ${config.upperLimit}`,
      levels: config.levels,
      profitPercentage: config.profitPercentage,
      perGridAmount: config.capital.perGridAmount,
      totalInvestment: config.investment,
      minimumInvestment: config.minimumInvestment,
      riskLevel: config.indicators.riskLevel,
      gridCount: grids.length,
      currentMarketPrice: config.indicators.currentPrice,
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
  } else if (strategyType === "UTC") {
    // ✅ UTC Strategy Configuration
    const utcConfig = {
      timeFrame,
      leverage: segment === "FUTURES" ? leverage : undefined,
      upperLimit: utcUpperLimit,
      lowerLimit: utcLowerLimit,
      capital: {
        perOrderAmount: investmentPerRun,
        maxCapital: investmentCap,
      },
      // UT Bot Indicator Parameters (defaults)
      buyKeySensitivity: 1.0,
      buyAtrPeriod: 10,
      sellKeySensitivity: 1.0,
      sellAtrPeriod: 10,
      // STC Indicator Parameters (defaults)
      stcLength: 12,
      stcFastLength: 26,
      stcSlowLength: 50,
      risk: {
        stopLoss: {
          enabled: stopLossPct !== undefined,
          percentage: stopLossPct,
        },
      },
      entry: {
        priceTrigger: {
          enabled: priceStart !== undefined && priceStop !== undefined,
          startPrice: priceStart,
          stopPrice: priceStop,
        },
      },
    };

    config = utcConfig;
    nextRunAt = null; // UTC is signal-based, not time-based

    console.log("[UTC_CONFIG_COMPLETE]", {
      timeFrame: config.timeFrame,
      upperLimit: config.upperLimit,
      lowerLimit: config.lowerLimit,
      leverage: config.leverage,
      perOrderAmount: config.capital.perOrderAmount,
      maxCapital: config.capital.maxCapital,
    });
  } else if (strategyType === "INDY_TREND") {
    const {
      strategyName,
      investment,
      investmentCap,
      lowerLimit: indyLowerLimit,
      upperLimit: indyUpperLimit,
      priceTriggerStart,
      priceTriggerStop,
      stopLossByPercent,
      riskRewardRatio,
      mode,
      supertrendFactor,
      supertrendAtrLength,
      rsiLength,
      rsiUpperBand,
      rsiLowerBand,
      adxSmoothing,
      adxDiLength,
      adxThreshold,
      partialExit,
      trailingStop,
    } = data;

    if (!strategyName || strategyName.length < 3 || strategyName.length > 50) {
      throw new Error("Strategy name must be 3-50 characters");
    }

    if (!investment || investment <= 0) {
      throw new Error("Investment must be greater than 0");
    }

    if (!timeFrame) {
      throw new Error("Time frame is required");
    }

    if (segment === "FUTURES" && assetType === "CRYPTO") {
      if (!leverage || leverage < 1 || leverage > 20) {
        throw new Error("Leverage must be between 1x and 20x for Crypto Futures");
      }
    }

    config = {
      timeFrame: timeFrame || "5m",
      leverage: segment === "FUTURES" ? leverage : undefined,
      lowerLimit: indyLowerLimit,
      upperLimit: indyUpperLimit,
      priceTriggerStart,
      priceTriggerStop,
      investment,
      investmentCap: investmentCap || investment * 3,
      stopLossByPercent: stopLossByPercent || 2,
      riskRewardRatio: riskRewardRatio || 2,
      supertrend: {
        factor: supertrendFactor || 3.0,
        atrLength: supertrendAtrLength || 10,
      },
      rsi: {
        length: rsiLength || 21,
        upperBand: rsiUpperBand || 70,
        lowerBand: rsiLowerBand || 30,
      },
      adx: {
        smoothing: adxSmoothing || 21,
        diLength: adxDiLength || 21,
        threshold: adxThreshold || 25,
      },
      mode: mode || "NEUTRAL",
      partialExit,
      trailingStop,
    };

    nextRunAt = null;

    console.log("[INDY_TREND_CONFIG_COMPLETE]", {
      strategyName,
      timeFrame: config.timeFrame,
      investment: config.investment,
      investmentCap: config.investmentCap,
      mode: config.mode,
    });
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
