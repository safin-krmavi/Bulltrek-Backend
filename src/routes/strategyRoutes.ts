import { Router } from "express";
import {
  createStrategyController,
  getUserStrategiesController,
  getStrategyByIdController,
  updateStrategyController,
  deleteStrategyController,
  updateStrategyStatusController,
  calculateSmartGridLimits,
  calculateSmartGridLimitsEnhanced,
} from "../controllers/strategyController";
import {
  subscribeToCopyStrategy,
  unsubscribeFromCopyStrategy,
  getUserCopySubscriptions,
  getPublishedStrategies,
} from "../controllers/copyTadingController";
import {
  purchaseStrategyController,
  getMyPurchasedStrategiesController,
  getStrategyPurchasesController,
} from "../controllers/marketplaceController";
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

// ✅ MARKETPLACE ROUTES - PUT SPECIFIC ROUTES FIRST

// Get logged-in user's purchased strategies - MUST BE BEFORE :strategyId
router.get("/strategies/purchases/me", verifyUser, getMyPurchasedStrategiesController);

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

// Purchase a published strategy (marketplace)
router.post(
  "/strategies/purchase",
  verifyUser,
  purchaseStrategyController
);

// Get purchase history for a strategy (seller view)
router.get(
  "/strategies/:strategyId/purchases",
  verifyUser,
  getStrategyPurchasesController
);

// Unsubscribe from a strategy
router.delete(
  "/strategies/subscription/:subscriptionId",
  verifyUser,
  unsubscribeFromCopyStrategy
);
router.post("/calculate-smart-grid-limits", calculateSmartGridLimits);
router.post("/calculate-smart-grid-limits-enhanced", calculateSmartGridLimitsEnhanced);

export default router;