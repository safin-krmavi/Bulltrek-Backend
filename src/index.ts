import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import rootrouter from "./routes/index";
import { resubscribeAllStrategies } from "./services/strategies/resubscribeStrategies";
import fs from "fs";
import path from "path";
import { runStrategyScheduler } from "./utils/scheduler/strategyScheduler";
import {
  bootstrapAll,
  bootstrapCryptoMarketData,
} from "./sockets/crypto/marketData/marketDataBootstrap";
import {
  bootstrapMarketData,
  bootstrapStockAll,
} from "./sockets/stocks/marketData/marketDataBootstrap";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Register SocketManager first
// registerSocketManager(app);
// setInterval(runStrategyScheduler, 60 * 1000);
 

// Paths
const DATA_DIR = path.join(process.cwd(), "data");
const ZERODHA_JSON_PATH = path.join(DATA_DIR, "zerodha_instruments.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use("/api/v1/", rootrouter);

// Routes
app.get("/", (req, res) => {
  res.send("BullTrek Backend running");
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  await bootstrapAll();
  await bootstrapStockAll();
  await resubscribeAllStrategies();
});

export { app, server };
