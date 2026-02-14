import prisma from "../../config/db.config.js";

export interface PaperPositionFilters {
    strategyId?: string;
    symbol?: string;
    status?: string;
    exchange?: string;
}

/**
 * Get paper positions for a user with optional filters
 */
export async function getPaperPositions(
    userId: string,
    filters?: PaperPositionFilters
) {
    const where: any = { userId };

    if (filters?.strategyId) where.strategyId = filters.strategyId;
    if (filters?.symbol) where.symbol = filters.symbol;
    if (filters?.status) where.status = filters.status;
    if (filters?.exchange) where.exchange = filters.exchange;

    const positions = await prisma.paperTradePosition.findMany({
        where,
        orderBy: { createdAt: "desc" },
    });

    console.log("[PAPER_POSITION] Fetched positions", {
        userId,
        filters,
        count: positions.length,
    });

    return positions;
}

/**
 * Close a paper position and update balance
 */
export async function closePaperPosition(
    positionId: string,
    exitPrice: number
) {
    console.log("[PAPER_POSITION] Closing position", { positionId, exitPrice });

    const position = await prisma.paperTradePosition.findUnique({
        where: { id: positionId },
    });

    if (!position) {
        throw new Error("Position not found");
    }

    if (position.status !== "OPEN") {
        throw new Error("Position is not open");
    }

    // Calculate P&L
    const pnl = calculateRealizedPnL(position, exitPrice);

    console.log("[PAPER_POSITION] Calculated P&L", {
        positionId,
        entryPrice: position.entryPrice,
        exitPrice,
        quantity: position.quantity,
        side: position.side,
        pnl,
    });

    // Close position
    await prisma.paperTradePosition.update({
        where: { id: positionId },
        data: {
            status: "CLOSED",
            closedAt: new Date(),
        },
    });

    // Update balance
    const baseAsset = getBaseAsset(position.symbol, position.assetType);
    const balance = await prisma.paperBalance.findUnique({
        where: {
            userId_exchange_assetType_asset: {
                userId: position.userId,
                exchange: position.exchange,
                assetType: position.assetType,
                asset: baseAsset,
            },
        },
    });

    if (!balance) {
        console.error("[PAPER_POSITION] Balance not found for position", {
            userId: position.userId,
            exchange: position.exchange,
            assetType: position.assetType,
            asset: baseAsset,
        });
        return;
    }

    // Calculate capital to release
    const initialCapital = position.entryPrice * position.quantity;
    const finalCapital = initialCapital + pnl;

    // Update balance: release locked capital + add/subtract P&L
    await prisma.paperBalance.update({
        where: {
            userId_exchange_assetType_asset: {
                userId: position.userId,
                exchange: position.exchange,
                assetType: position.assetType,
                asset: baseAsset,
            },
        },
        data: {
            balance: balance.balance + finalCapital,
            lockedBalance: Math.max(0, balance.lockedBalance - initialCapital),
        },
    });

    console.log("[PAPER_POSITION] Position closed and balance updated", {
        positionId,
        pnl,
        releasedCapital: initialCapital,
        finalCapital,
        newBalance: balance.balance + finalCapital,
    });
}

/**
 * Calculate unrealized P&L for an open position
 */
export function calculateUnrealizedPnL(
    position: any,
    currentPrice: number
): number {
    if (position.status !== "OPEN") {
        return 0;
    }

    if (position.side === "BUY") {
        // LONG position: profit when price goes up
        return (currentPrice - position.entryPrice) * position.quantity;
    } else {
        // SHORT position: profit when price goes down
        return (position.entryPrice - currentPrice) * position.quantity;
    }
}

/**
 * Calculate realized P&L when closing a position
 */
function calculateRealizedPnL(position: any, exitPrice: number): number {
    if (position.side === "BUY") {
        // LONG position
        return (exitPrice - position.entryPrice) * position.quantity;
    } else {
        // SHORT position
        return (position.entryPrice - exitPrice) * position.quantity;
    }
}

/**
 * Get paper balance for a user
 */
export async function getPaperBalance(
    userId: string,
    exchange: string,
    assetType: string,
    asset?: string
) {
    const baseAsset = asset || (assetType === "CRYPTO" ? "USDT" : "INR");

    let balance = await prisma.paperBalance.findUnique({
        where: {
            userId_exchange_assetType_asset: {
                userId,
                exchange,
                assetType,
                asset: baseAsset,
            },
        },
    });

    if (!balance) {
        // Create default balance
        const defaultBalance = assetType === "CRYPTO" ? 10000 : 100000;
        balance = await prisma.paperBalance.create({
            data: {
                userId,
                exchange,
                assetType,
                asset: baseAsset,
                balance: defaultBalance,
                lockedBalance: 0,
            },
        });

        console.log("[PAPER_POSITION] Created default balance", {
            userId,
            exchange,
            assetType,
            asset: baseAsset,
            balance: defaultBalance,
        });
    }

    return balance;
}

/**
 * Update paper balance
 */
export async function updatePaperBalance(
    userId: string,
    exchange: string,
    assetType: string,
    asset: string,
    updates: { balance?: number; lockedBalance?: number }
) {
    await prisma.paperBalance.update({
        where: {
            userId_exchange_assetType_asset: {
                userId,
                exchange,
                assetType,
                asset,
            },
        },
        data: updates,
    });

    console.log("[PAPER_POSITION] Balance updated", {
        userId,
        exchange,
        assetType,
        asset,
        updates,
    });
}

/**
 * Reset paper balance to default
 */
export async function resetPaperBalance(
    userId: string,
    exchange: string,
    assetType: string,
    asset?: string,
    newBalance?: number
) {
    const baseAsset = asset || (assetType === "CRYPTO" ? "USDT" : "INR");
    const defaultBalance = newBalance || (assetType === "CRYPTO" ? 10000 : 100000);

    await prisma.paperBalance.upsert({
        where: {
            userId_exchange_assetType_asset: {
                userId,
                exchange,
                assetType,
                asset: baseAsset,
            },
        },
        update: {
            balance: defaultBalance,
            lockedBalance: 0,
        },
        create: {
            userId,
            exchange,
            assetType,
            asset: baseAsset,
            balance: defaultBalance,
            lockedBalance: 0,
        },
    });

    console.log("[PAPER_POSITION] Balance reset", {
        userId,
        exchange,
        assetType,
        asset: baseAsset,
        newBalance: defaultBalance,
    });
}

/**
 * Get total P&L summary for a user
 */
export async function getPaperPnLSummary(userId: string, filters?: {
    exchange?: string;
    strategyId?: string;
}) {
    const where: any = { userId };
    if (filters?.exchange) where.exchange = filters.exchange;
    if (filters?.strategyId) where.strategyId = filters.strategyId;

    // Get all positions (open and closed)
    const positions = await prisma.paperTradePosition.findMany({
        where,
    });

    let realizedPnL = 0;
    let unrealizedPnL = 0;

    for (const position of positions) {
        if (position.status === "CLOSED") {
            // For closed positions, we need to recalculate P&L
            // (In production, you'd store this in the position record)
            // For now, we'll skip closed positions as we don't have exit price
            continue;
        } else {
            // For open positions, we can't calculate unrealized P&L without current price
            // This would need to be calculated on the fly with current market data
            continue;
        }
    }

    return {
        realizedPnL,
        unrealizedPnL,
        totalPnL: realizedPnL + unrealizedPnL,
        openPositions: positions.filter(p => p.status === "OPEN").length,
        closedPositions: positions.filter(p => p.status === "CLOSED").length,
    };
}

/**
 * Extract base asset from symbol
 */
function getBaseAsset(symbol: string, assetType: string): string {
    if (assetType === "CRYPTO") {
        if (symbol.endsWith("USDT")) return "USDT";
        if (symbol.endsWith("BUSD")) return "BUSD";
        if (symbol.endsWith("BTC")) return "BTC";
        if (symbol.endsWith("ETH")) return "ETH";
        return "USDT";
    } else {
        return "INR";
    }
}
