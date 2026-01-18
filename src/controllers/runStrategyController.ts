// controllers/runStrategyController.ts
import { Request, Response } from "express";
import prisma from "../config/db.config";
import { computeNextRunAt } from "../utils/scheduler/computeNextRunAt";
import {
  sendBadRequest,
  sendNotFound,
  sendSuccess,
  sendUnauthorized,
} from "../utils/response";
import { executeStrategy } from "../strategies/engines/timeEngine";

/**
 * Endpoint for Lambda to trigger a strategy execution
 * POST /api/strategy/run
 * Body: { strategyId: string }
 */
export const runStrategyController = async (req: Request, res: Response) => {
  const { strategyId } = req.body;
  const signature = req.headers["bulltrek-signature"] as string;

  console.log("[RUN_STRATEGY] Incoming request", {
    strategyId,
    hasSignature: !!signature,
  });
  if (!signature) {
    console.warn("[RUN_STRATEGY] Missing signature");

    return sendBadRequest(res, "No signature found");
  }
  if (signature !== process.env.STRATEGY_LAMBDA_SECRET) {
    console.warn("[RUN_STRATEGY] Invalid signature", { signature });
    return sendUnauthorized(res, "Invalid signature");
  }
  if (!strategyId) {
    console.warn("[RUN_STRATEGY] Missing strategyId");
    return sendBadRequest(res, "strategyId is required");
  }

  try {
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
    });
    if (!strategy) {
      console.warn("[RUN_STRATEGY] Strategy not found", { strategyId });
      return sendNotFound(res, "Strategy not found");
    }
    if (strategy.status !== "ACTIVE") {
      console.warn("[RUN_STRATEGY] Strategy not active", {
        strategyId,
        status: strategy.status,
      });
      return sendBadRequest(res, "Strategy is not active");
    }
    if (
      strategy.lastExecutedAt &&
      Date.now() - strategy.lastExecutedAt.getTime() < 30_000
    ) {
      console.log("[RUN_STRATEGY] Execution skipped (recent run)", {
        strategyId,
        lastExecutedAt: strategy.lastExecutedAt,
      });
      return sendSuccess(res, "Recently executed");
    }
    console.log("[RUN_STRATEGY] Executing strategy", {
      strategyId,
      type: strategy.type,
    });

    await executeStrategy(strategy);
    console.log("[RUN_STRATEGY] Strategy execution completed", {
      strategyId,
    });

    // Optionally update nextRunAt
    // const nextRun = computeNextRunAt((strategy.config as any)?.schedule);
    await prisma.strategy.update({
      where: { id: strategy.id },
      data: { lastExecutedAt: new Date() },
    });
    console.log("[RUN_STRATEGY] Updated lastExecutedAt", {
      strategyId,
      executedAt: new Date().toISOString(),
    });

    return sendSuccess(res, "Strategy executed");
  } catch (error: any) {
    console.error("[RUN_STRATEGY] Execution failed", {
      strategyId,
      error: error?.message,
    });
    return res.status(500).json({ error: error.message });
  }
};
