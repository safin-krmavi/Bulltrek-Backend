import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import rootrouter from "./routes/index";
import { resubscribeAllStrategies } from "./services/strategies/resubscribeStrategies";
import { fetchAndStoreZerodhaInstruments } from "./services/stocks/exchange/instrumentTokenService";
import fs from "fs";
import path from "path";
import { runStrategyScheduler } from "./utils/scheduler/strategyScheduler";
import { bootstrapCryptoMarketData } from "./sockets/crypto/marketData/marketDataBootstrap";
import { bootstrapMarketData } from "./sockets/stocks/marketData/marketDataBootstrap";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Register SocketManager first
// registerSocketManager(app);
setInterval(runStrategyScheduler, 60 * 1000);

// (async () => {
//   try {
//     await fetchAndStoreZerodhaInstruments();
//   } catch (err) {
//     console.error("Failed to fetch Zerodha instruments:", err);
//   }
// })();

// Paths
const DATA_DIR = path.join(process.cwd(), "data");
const ZERODHA_JSON_PATH = path.join(DATA_DIR, "zerodha_instruments.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Function to safely fetch Zerodha instruments if missing
async function ensureZerodhaInstruments() {
  if (!fs.existsSync(ZERODHA_JSON_PATH)) {
    try {
      console.log("Fetching Zerodha instruments...");
      const instruments = await fetchAndStoreZerodhaInstruments();

      // Double-check write
      fs.writeFileSync(
        ZERODHA_JSON_PATH,
        JSON.stringify(instruments, null, 2),
        {
          encoding: "utf-8",
        }
      );

      console.log(`Zerodha instruments saved to ${ZERODHA_JSON_PATH}`);
    } catch (err) {
      console.error("Failed to fetch Zerodha instruments:", err);
    }
  } else {
    console.log(`Zerodha instruments already exist at ${ZERODHA_JSON_PATH}`);
  }
}
app.use("/api/v1/", rootrouter);

// Routes
app.get("/", (req, res) => {
  res.send("BullTrek Backend running");
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Only fetch once after server starts
  await ensureZerodhaInstruments();

  await bootstrapCryptoMarketData();
  await bootstrapMarketData();
  await resubscribeAllStrategies();
});

export { app, server };
