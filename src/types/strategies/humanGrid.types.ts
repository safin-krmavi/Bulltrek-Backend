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
};

export type HumanGridState = {
  grids: GridLevel[];
  investedCapital: number;
  lastExecutionAt: number | null;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  pendingOrders: Set<string>;
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
  lifecycle: SmartGridLifecycle; // ✅ NEW
};

export type SmartGridConfig = {
  lowerLimit: number;
  upperLimit: number;
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