import { Response, Request } from "express";
import {
    purchaseStrategy,
    getUserPurchases,
    getStrategyPurchases,
} from "../services/marketplaceService";
import {
    sendBadRequest,
    sendServerError,
    sendSuccess,
} from "../utils/response";

/**
 * Purchase a published strategy
 * POST /api/v1/strategies/purchase
 */
export const purchaseStrategyController = async (req: any, res: Response) => {
    const { strategyId, executionMode = "PAPER", customName } = req.body;
    const buyerUserId = req.user.userId;

    try {
        // Validate strategyId
        if (!strategyId) {
            return sendBadRequest(res, "strategyId is required");
        }

        // Validate execution mode
        if (!["LIVE", "PAPER"].includes(executionMode)) {
            return sendBadRequest(
                res,
                "executionMode must be either LIVE or PAPER"
            );
        }

        const { purchase, forkedStrategy } = await purchaseStrategy(
            strategyId,
            buyerUserId,
            {
                executionMode,
                customName,
            }
        );

        return sendSuccess(res, "Strategy purchased successfully", {
            purchase,
            strategy: forkedStrategy,
        });
    } catch (error: any) {
        console.error("[MARKETPLACE_PURCHASE_ERROR]", error);
        return sendServerError(res, error.message);
    }
};

/**
 * Get all strategies purchased by the logged-in user
 * GET /api/v1/strategies/purchases/me
 */
export const getMyPurchasedStrategiesController = async (
    req: any,
    res: Response
) => {
    const userId = req.user.userId;

    try {
        const purchases = await getUserPurchases(userId);

        return sendSuccess(res, "Purchased strategies fetched", purchases);
    } catch (error: any) {
        console.error("[MARKETPLACE_GET_PURCHASES_ERROR]", error);
        return sendServerError(res, error.message);
    }
};

/**
 * Get purchase history for a specific strategy (seller view)
 * GET /api/v1/strategies/:strategyId/purchases
 */
export const getStrategyPurchasesController = async (
    req: any,
    res: Response
) => {
    const { strategyId } = req.params;
    const userId = req.user.userId;

    try {
        const purchases = await getStrategyPurchases(strategyId, userId);

        return sendSuccess(
            res,
            "Strategy purchase history fetched",
            purchases
        );
    } catch (error: any) {
        console.error("[MARKETPLACE_GET_STRATEGY_PURCHASES_ERROR]", error);
        return sendServerError(res, error.message);
    }
};
