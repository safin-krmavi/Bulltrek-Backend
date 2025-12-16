import path from "path";
// import { promises as fs } from "fs";
export const DATA_DIR = path.join(process.cwd(), "data");
export const FILE_PATH = path.join(DATA_DIR, "symbol_pairs.json");
