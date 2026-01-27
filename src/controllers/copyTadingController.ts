import { Response, Request } from "express";
import { getStrategyById } from "../services/strategyService";
import {
  sendBadRequest,
  sendServerError,
  sendSuccess,
} from "../utils/response";
import prisma from "../config/db.config";

// Subscribe to a published strategy
export const subscribeToCopyStrategy = async (req: any, res: Response) => {
  const { strategyId } = req.params;
  const { multiplier = 1, exchange } = req.body;
  const followerUserId = req.user.userId;

  try {
    // Verify strategy is PUBLISHED
    const strategy = await getStrategyById(strategyId);
    if (strategy.executionMode !== "PUBLISHED") {
      return sendBadRequest(res, "Strategy is not available for copying");
    }

    // Prevent self-subscription
    if (strategy.userId === followerUserId) {
      return sendBadRequest(res, "Cannot subscribe to your own strategy");
    }

    const followerExchange = exchange ?? strategy.exchange;

    // Create subscription
    const subscription = await prisma.strategyCopySubscription.create({
      data: {
        strategyId,
        followerUserId,
        multiplier,
        followerExchange,
        isActive: true,
      }
    });

    return sendSuccess(
      res,
      "Successfully subscribed to strategy",
      subscription,
    );
  } catch (error: any) {
    console.error("[COPY_SUBSCRIBE]", error);
    return sendServerError(res, error.message);
  }
};

export const unsubscribeFromCopyStrategy = async (req: any, res: Response) => {
  const { subscriptionId } = req.params;
  const userId = req.user.userId;

  try {
    await prisma.strategyCopySubscription.deleteMany({
      where: {
        id: subscriptionId,
        followerUserId: userId,
      },
    });

    return sendSuccess(res, "Successfully unsubscribed");
  } catch (error: any) {
    console.error("[COPY_UNSUBSCRIBE]", error);
    return sendServerError(res, error.message);
  } 
};

export const getUserCopySubscriptions = async (req: any, res: Response) => {
  const userId = req.user.userId;

  try {
    const subscriptions = await prisma.strategyCopySubscription.findMany({
      where: { followerUserId: userId },
      include: {
        strategy: true, // You'll need to add relation in Prisma schema
      },
    });

    return sendSuccess(res, "Subscriptions fetched", subscriptions);
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};
export const getPublishedStrategies = async (req: any, res: Response) => {
  try {
    const strategies = await prisma.strategy.findMany({
      where: {
        executionMode: "PUBLISHED",
        status: "ACTIVE",
      },
      include: {
        // user: {
        //   select: { id: true, username: true }, // Don't expose sensitive data
        // },
        _count: {
          select: { copyFollowers: true }, // Show popularity
        },
      },
    });

    return sendSuccess(res, "Published strategies fetched", strategies);
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};

