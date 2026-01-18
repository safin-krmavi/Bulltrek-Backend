import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import http from "http";
import { initSocketService } from "./socketHandleOrders";
import { runStrategyScheduler } from "./utils/scheduler/strategyScheduler";
import rootrouter from "./routes";
import {
  bootstrapAll,
  bootstrapCryptoMarketData,
} from "./sockets/crypto/marketData/marketDataBootstrap";
import {
  bootstrapMarketData,
  bootstrapStockAll,
} from "./sockets/stocks/marketData/marketDataBootstrap";
import { resubscribeAllStrategies } from "./services/strategies/resubscribeStrategies";
import { bootstrapStrategies } from "./strategies/bootstrapStrategies";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// API routes
app.use("/api/v1/", rootrouter);
app.get("/", (req, res) => res.send("BullTrek Backend running"));

// Create HTTP server for both APIs and sockets
const server = http.createServer(app);

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    // 1️⃣ Bootstrap market data
    await bootstrapCryptoMarketData();
    await bootstrapMarketData();
    console.log("Market data bootstrapped");

    // 2️⃣ Load all strategies into runtime
    // await resubscribeAllStrategies();
    await bootstrapStrategies();

    console.log("Strategies loaded into runtime");

    // 3️⃣ Initialize all sockets (crypto + stock)
    await initSocketService(server);
    console.log("Sockets initialized");

    // 4️⃣ Start strategy scheduler
    // setInterval(runStrategyScheduler, 60 * 1000);
    console.log("Strategy scheduler running");
  } catch (err) {
    console.error("Error during server startup:", err);
    process.exit(1);
  }
});
export { app };
