import { TradeStatus } from "@prisma/client";
import path from "path";
// import { promises as fs } from "fs";
export const DATA_DIR = path.join(process.cwd(), "data");
export const FILE_PATH = path.join(DATA_DIR, "symbol_pairs.json");

export const tradeStatusPriority: Record<TradeStatus, number> = {
  OPEN: 0,
  TIMEOUTED: 0,
  PENDING: 1,
  CANCELLED: 2,
  PARTIALLY_FILLED: 3,
  EXECUTED: 4,
  FAILED: 5,
  REJECTED: 5,
};
