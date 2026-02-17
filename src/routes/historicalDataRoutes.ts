import { Router } from "express";
import {
    fetchHistoricalDataController,
    getHistoricalDataController,
    refreshHistoricalDataController,
    cleanupHistoricalDataController,
} from "../controllers/historicalDataController";
import { verifyUser } from "../middleware/verifyUser";

const router = Router();

// Fetch and store historical data
router.post("/historical-data/fetch", verifyUser, fetchHistoricalDataController);

// Get stored historical data
router.get("/historical-data", verifyUser, getHistoricalDataController);

// Refresh historical data (force fetch)
router.post("/historical-data/refresh", verifyUser, refreshHistoricalDataController);

// Cleanup old data
router.delete("/historical-data/cleanup", verifyUser, cleanupHistoricalDataController);

export default router;
