// routes/strategyRoutes.ts
import { Router } from "express";
import {
  createStrategyController,
  getUserStrategiesController,
} from "../controllers/strategyController";
import { verifyCryptoUser } from "../middleware/crypto/authMiddleware";

const router = Router();

// Create a new strategy
router.post("/strategies", verifyCryptoUser, createStrategyController);

// Get all strategies for the logged-in user
router.get("/strategies", getUserStrategiesController);

export default router;
