import prisma from "../config/db.config";
import { registerStrategy } from "../strategies/dispatcher";
import { getStrategyById } from "./strategyService";

/**
 * Purchase a published strategy and create a forked copy owned by the buyer
 */
export const purchaseStrategy = async (
    originalStrategyId: string,
    buyerUserId: string,
    options: {
        executionMode: "LIVE" | "PAPER";
        customName?: string;
    }
) => {
    // 1. Fetch original strategy
    const original = await getStrategyById(originalStrategyId);

    // 2. Validate strategy is published
    if (original.executionMode !== "PUBLISHED") {
        throw new Error("Strategy is not available for purchase");
    }

    // 3. Prevent self-purchase
    if (original.userId === buyerUserId) {
        throw new Error("Cannot purchase your own strategy");
    }

    // 4. Check if already purchased
    const existingPurchase = await prisma.strategyPurchase.findFirst({
        where: {
            originalStrategyId,
            buyerUserId,
        },
    });

    if (existingPurchase) {
        throw new Error("You have already purchased this strategy");
    }

    // 5. Clone strategy with buyer as owner
    const forkedStrategy = await prisma.strategy.create({
        data: {
            userId: buyerUserId,
            name: options.customName || `${original.name} (Purchased)`,
            assetType: original.assetType,
            type: original.type,
            exchange: original.exchange,
            segment: original.segment,
            symbol: original.symbol,
            config: original.config, // Deep clone of config
            status: "ACTIVE",
            executionMode: options.executionMode,
        },
    });

    console.log("[MARKETPLACE_PURCHASE] Strategy forked", {
        originalId: originalStrategyId,
        forkedId: forkedStrategy.id,
        buyer: buyerUserId,
        executionMode: options.executionMode,
    });

    // 6. Record purchase
    const purchase = await prisma.strategyPurchase.create({
        data: {
            originalStrategyId,
            buyerUserId,
            forkedStrategyId: forkedStrategy.id,
        },
    });

    // 7. Register strategy if LIVE
    if (options.executionMode === "LIVE") {
        await registerStrategy(forkedStrategy.id);
        console.log("[MARKETPLACE_PURCHASE] Strategy registered", {
            forkedId: forkedStrategy.id,
        });
    }

    return { purchase, forkedStrategy };
};

/**
 * Get all strategies purchased by a user
 */
export const getUserPurchases = async (userId: string) => {
    const purchases = await prisma.strategyPurchase.findMany({
        where: { buyerUserId: userId },
        orderBy: { createdAt: "desc" },
    });

    // Manually fetch forked strategies
    const purchasesWithStrategies = await Promise.all(
        purchases.map(async (purchase) => {
            const forkedStrategy = await prisma.strategy.findUnique({
                where: { id: purchase.forkedStrategyId },
            });
            return {
                ...purchase,
                forkedStrategy,
            };
        })
    );

    return purchasesWithStrategies;
};

/**
 * Get purchase history for a specific strategy (seller view)
 */
export const getStrategyPurchases = async (
    strategyId: string,
    ownerId: string
) => {
    // Verify ownership
    const strategy = await getStrategyById(strategyId);
    if (strategy.userId !== ownerId) {
        throw new Error("You do not own this strategy");
    }

    const purchases = await prisma.strategyPurchase.findMany({
        where: { originalStrategyId: strategyId },
        select: {
            id: true,
            buyerUserId: true,
            createdAt: true,
            // Don't expose forkedStrategyId for privacy
        },
        orderBy: { createdAt: "desc" },
    });

    return purchases;
};
