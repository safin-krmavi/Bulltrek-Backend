import { Router } from "express";
import {
  createStrategyController,
  getUserStrategiesController,
  getStrategyByIdController,
  updateStrategyController,
  deleteStrategyController,
  updateStrategyStatusController,
} from "../controllers/strategyController";
import {
  subscribeToCopyStrategy,
  unsubscribeFromCopyStrategy,
  getUserCopySubscriptions,
  getPublishedStrategies,
} from "../controllers/copyTadingController";
import { verifyUser } from "../middleware/verifyUser";
import { runStrategyController } from "../controllers/runStrategyController";

const router = Router();

router.post("/run", runStrategyController);

// Create a new strategy
router.post("/strategies", verifyUser, createStrategyController);

// Get all strategies for logged-in user
router.get("/strategies", verifyUser, getUserStrategiesController);

// ✅ COPY TRADING ROUTES - PUT SPECIFIC ROUTES FIRST

// Get all published strategies (Explore) - MUST BE BEFORE :strategyId
router.get("/strategies/published", verifyUser, getPublishedStrategies);

// Get logged-in user's copy subscriptions - MUST BE BEFORE :strategyId
router.get("/strategies/subscriptions/me", verifyUser, getUserCopySubscriptions);

// ✅ NOW PUT PARAMETERIZED ROUTES

// Get single strategy by ID
router.get("/strategies/:strategyId", verifyUser, getStrategyByIdController);

// Update strategy (config, capital, schedule, etc.)
router.put("/strategies/:strategyId", verifyUser, updateStrategyController);

// Update strategy status (ACTIVE | PAUSED | STOPPED)
router.patch(
  "/strategies/:strategyId/status",
  verifyUser,
  updateStrategyStatusController
);

// Delete strategy
router.delete("/strategies/:strategyId", verifyUser, deleteStrategyController);

// Subscribe to a published strategy
router.post(
  "/strategies/:strategyId/subscribe",
  verifyUser,
  subscribeToCopyStrategy
);

// Unsubscribe from a strategy
router.delete(
  "/strategies/subscription/:subscriptionId",
  verifyUser,
  unsubscribeFromCopyStrategy
);

export default router;