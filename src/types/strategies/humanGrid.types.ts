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