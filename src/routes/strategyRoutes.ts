// routes/strategyRoutes.ts
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

const router = Router();

// Create a new strategy
router.post("/strategies", verifyUser, createStrategyController);

// Get all strategies for logged-in user
router.get("/strategies", verifyUser, getUserStrategiesController);

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

/* ===================== COPY TRADING ===================== */

// Get all published strategies (Explore)
router.get("/strategies/published", verifyUser, getPublishedStrategies);

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

// Get logged-in user's copy subscriptions
router.get(
  "/strategies/subscriptions/me",
  verifyUser,
  getUserCopySubscriptions
);
export default router;
