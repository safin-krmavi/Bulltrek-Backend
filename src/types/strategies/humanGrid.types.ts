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
  maxCycles?: number; // ✅ NEW: Maximum number of complete grid cycles
};

export type HumanGridState = {
  grids: GridLevel[];
  investedCapital: number;
  lastExecutionAt: number | null;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  lifecycle: GridLifecycle;
  pendingOrders: Set<string>;
  executedCycles: number; // ✅ FIX: Add this property
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

// ✅ UPDATED: Smart Grid State with Lifecycle
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
    atr: number;
  };
  mode: "STATIC" | "DYNAMIC";
  lifecycle: SmartGridLifecycle;
};

export type SmartGridConfig = {
  lowerLimit?: number; // ✅ NOW OPTIONAL - Auto-generated if not provided
  upperLimit?: number; // ✅ NOW OPTIONAL - Auto-generated if not provided
  levels: number;
  profitPercentage: number;
  capital: {
    perGridAmount: number;
    maxCapital: number;
  };
  stopLossPercentage?: number;
  leverage?: number;
  direction?: "LONG" | "SHORT";
  dataSetDays: number;
  mode: "STATIC" | "DYNAMIC";
  recalculationInterval?: number; // minutes
};

// ✅ NEW: Risk classification type
export type GridRiskLevel = "LOW" | "MEDIUM" | "HIGH";

// ✅ NEW: Extended indicator output
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