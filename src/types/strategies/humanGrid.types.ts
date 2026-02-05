export type GridLifecycle = "INIT" | "WAITING_FOR_PRICE" | "RUNNING" | "STOPPED";

export type GridLevel = {
  id: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  status: "EMPTY" | "BOUGHT" | "SOLD";
  positionId?: string;
};

export type HumanGridConfig = {
  lowerLimit: number;
  upperLimit: number;
  entryInterval: number;
  bookProfitBy: number;
  stopLossPercentage?: number;
  capital: {
    perGridAmount: number;
    maxCapital: number;
  };
  leverage?: number;
  direction?: "LONG" | "SHORT";
  maxCycles?: number;
};

export type HumanGridState = {
  grids: GridLevel[];
  investedCapital: number;
  lastExecutionAt: number | null;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  lifecycle: GridLifecycle;
  pendingOrders: Set<string>;
  executedCycles: number;
};

export type GridDecision = {
  action: "BUY" | "SELL" | "HOLD";
  price?: number;
  quantity?: number;
  gridId?: string;
  reason?: string;
};

// ✅ NEW: Smart Grid Lifecycle
export type SmartGridLifecycle =
  | "INIT"
  | "WAITING_FOR_PRICE"
  | "BOOTSTRAPPED"
  | "RUNNING"
  | "STOPPED";

// ✅ UPDATED: Smart Grid Config with new fields
export type SmartGridConfig = {
  type: "NEUTRAL" | "LONG" | "SHORT"; // ✅ NEW: Strategy type
  dataSetDays: number; // ✅ Data set (3, 7, 30, 180, 365)
  lowerLimit?: number; // ✅ Optional - Auto-generated if not provided
  upperLimit?: number; // ✅ Optional - Auto-generated if not provided
  levels: number; // ✅ Number of grid levels
  profitPercentage: number; // ✅ Profit per level (%)
  investment: number; // ✅ Total investment amount
  minimumInvestment: number; // ✅ Minimum investment per order
  capital: {
    perGridAmount: number; // Calculated from investment/levels
    maxCapital: number; // Same as investment
  };
  stopLossPercentage?: number;
  leverage?: number;
  direction?: "LONG" | "SHORT";
  mode: "STATIC" | "DYNAMIC";
  recalculationInterval?: number; // minutes
};

// ✅ UPDATED: Smart Grid State
export type SmartGridState = {
  grids: GridLevel[];
  investedCapital: number;
  lastExecutionAt: number | null;
  lastRecalculationAt: number | null;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  pendingOrders: Set<string>;
  indicators: {
    bollingerUpper: number;
    bollingerLower: number;
    bollingerMiddle: number;
    atr: number;
    historicalHigh: number;
    historicalLow: number;
    currentPrice: number;
    volatilityFactor: number;
    riskLevel: GridRiskLevel;
  };
  mode: "STATIC" | "DYNAMIC";
  lifecycle: SmartGridLifecycle;
  executedCycles: number; // ✅ Track completed cycles
};

// ✅ Existing types
export type GridRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type SmartGridIndicators = {
  bollingerUpper: number;
  bollingerLower: number;
  bollingerMiddle: number;
  atr: number;
  historicalHigh: number;
  historicalLow: number;
  currentPrice: number;
  volatilityFactor: number;
  riskLevel: GridRiskLevel;
};