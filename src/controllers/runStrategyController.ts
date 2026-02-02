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

export const runStrategyController = async (req: Request, res: Response) => {
  const { strategyId } = req.body;
  const signature = req.headers["bulltrek-signature"] as string;
  const receivedAt = Date.now();

  console.log("[RUN_STRATEGY] Incoming request", {
    strategyId,
    receivedAt: new Date(receivedAt).toISOString(),
    hasSignature: !!signature,
  });

  // ✅ Fast validation
  if (!signature || signature !== process.env.STRATEGY_LAMBDA_SECRET) {
    return sendUnauthorized(res, "Invalid signature");
  }

  if (!strategyId) {
    return sendBadRequest(res, "strategyId is required");
  }

  try {
    // ✅ Lean query - only fetch essentials
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      select: {
        id: true,
        status: true,
        type: true,
        userId: true,
        exchange: true,
        assetType: true,
        segment: true,
        symbol: true,
        config: true,
        nextRunAt: true,
        lastExecutedAt: true,
      },
    });

    if (!strategy) {
      return sendNotFound(res, "Strategy not found");
    }

    if (strategy.status !== "ACTIVE") {
      return sendBadRequest(res, "Strategy is not active");
    }

    // ✅ NEW: Validate execution window (allow 60s early, 30s late)
    const now = Date.now();
    const scheduledTime = strategy.nextRunAt?.getTime() || now;
    const timeDiff = now - scheduledTime;
    
    const EARLY_WINDOW = 60 * 1000; // 60s early
    const LATE_WINDOW = 30 * 1000;  // 30s late

    if (timeDiff < -EARLY_WINDOW) {
      console.warn("[RUN_STRATEGY] Execution too early", {
        strategyId,
        scheduledTime: strategy.nextRunAt?.toISOString(),
        receivedTime: new Date(now).toISOString(),
        earlyBySeconds: Math.abs(Math.floor(timeDiff / 1000)),
      });
      return sendBadRequest(res, "Execution window not reached");
    }

    if (timeDiff > LATE_WINDOW) {
      console.warn("[RUN_STRATEGY] Execution too late, skipping", {
        strategyId,
        scheduledTime: strategy.nextRunAt?.toISOString(),
        receivedTime: new Date(now).toISOString(),
        lateBySeconds: Math.floor(timeDiff / 1000),
      });
      
      // Update nextRunAt without executing
      const config = strategy.config as any;
      const nextRunAt = computeNextRunAt(config.schedule, new Date());
      
      await prisma.strategy.update({
        where: { id: strategy.id },
        data: { nextRunAt },
      });
      
      return sendSuccess(res, "Execution window missed, scheduled next run");
    }

    // ✅ Prevent duplicate execution (15s window)
    if (
      strategy.lastExecutedAt &&
      Date.now() - strategy.lastExecutedAt.getTime() < 15_000
    ) {
      console.log("[RUN_STRATEGY] Skipped - recently executed", {
        strategyId,
        lastExecutedAt: strategy.lastExecutedAt.toISOString(),
      });
      return sendSuccess(res, "Recently executed");
    }

    const queryTime = Date.now() - receivedAt;
    console.log("[RUN_STRATEGY] DB query completed", {
      strategyId,
      queryTimeMs: queryTime,
      executionWindow: {
        scheduledTime: strategy.nextRunAt?.toISOString(),
        actualTime: new Date(now).toISOString(),
        differenceSeconds: Math.floor(timeDiff / 1000),
      },
    });

    // ✅ CRITICAL: Respond to Lambda IMMEDIATELY
    res.status(200).json({
      success: true,
      message: "Strategy execution started",
      strategyId,
      receivedAt: new Date(receivedAt).toISOString(),
      respondedAt: new Date().toISOString(),
      latencyMs: Date.now() - receivedAt,
      executionWindow: {
        scheduled: strategy.nextRunAt?.toISOString(),
        actual: new Date(now).toISOString(),
        differenceMs: timeDiff,
      },
    });

    // ✅ Execute asynchronously (don't block Lambda)
    setImmediate(async () => {
      const executionStart = Date.now();

      try {
        console.log("[RUN_STRATEGY] Starting execution", {
          strategyId,
          type: strategy.type,
          symbol: strategy.symbol,
          scheduledTime: strategy.nextRunAt?.toISOString(),
          actualTime: new Date(executionStart).toISOString(),
          delayMs: strategy.nextRunAt
            ? executionStart - strategy.nextRunAt.getTime()
            : 0,
        });

        await executeStrategy(strategy as any);

        // ✅ Update nextRunAt for next execution
        const config = strategy.config as any;
        const nextRunAt = computeNextRunAt(config.schedule, new Date());

        await prisma.strategy.update({
          where: { id: strategy.id },
          data: {
            lastExecutedAt: new Date(executionStart),
            nextRunAt,
          },
        });

        const executionTime = Date.now() - executionStart;
        console.log("[RUN_STRATEGY] Execution completed", {
          strategyId,
          executionTimeMs: executionTime,
          nextRunAt: nextRunAt?.toISOString(),
        });
      } catch (error: any) {
        const executionTime = Date.now() - executionStart;
        console.error("[RUN_STRATEGY] Execution failed", {
          strategyId,
          error: error.message,
          executionTimeMs: executionTime,
        });
      }
    });
  } catch (error: any) {
    console.error("[RUN_STRATEGY] Controller error", {
      strategyId,
      error: error.message,
      latencyMs: Date.now() - receivedAt,
    });
    return res.status(500).json({ error: error.message });
  }
};
