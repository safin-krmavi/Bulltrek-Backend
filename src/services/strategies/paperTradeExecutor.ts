import prisma from "../../config/db.config.js";
import { TradeIntent } from "./tradeDispatcher.js";

export interface PaperTradeResult {
    success: boolean;
    position?: any;
    error?: string;
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Execute a paper trade (virtual trade without real exchange interaction)
 * Creates a PaperTradePosition and updates PaperBalance
 */
export async function executePaperTrade(
    intent: TradeIntent
): Promise<PaperTradeResult> {
    console.log("[PAPER_EXECUTOR] Executing paper trade", {
        userId: intent.userId,
        symbol: intent.symbol,
        side: intent.side,
        quantity: intent.quantity,
        price: intent.price,
    });

    try {
        // 1. Validate the trade
        const validation = await validatePaperTrade(intent);
        if (!validation.valid) {
            console.error("[PAPER_EXECUTOR] Validation failed", validation.error);
            return { success: false, error: validation.error };
        }

        // 2. Get or create paper balance
        const baseAsset = getBaseAsset(intent.symbol, intent.segment);
        const balance = await getPaperBalance(
            intent.userId,
            intent.exchange,
            intent.segment,
            baseAsset
        );

        // 3. Calculate required capital
        const requiredCapital = intent.quantity * intent.price;

        // 4. Check balance for BUY orders
        if (intent.side === "BUY") {
            const availableBalance = balance.balance - balance.lockedBalance;
            if (availableBalance < requiredCapital) {
                console.error("[PAPER_EXECUTOR] Insufficient balance", {
                    required: requiredCapital,
                    available: availableBalance,
                });
                return {
                    success: false,
                    error: `Insufficient paper balance. Required: ${requiredCapital}, Available: ${availableBalance}`,
                };
            }
        }

        // 5. Create paper position
        const position = await prisma.paperTradePosition.create({
            data: {
                userId: intent.userId,
                strategyId: intent.strategyId || null,
                symbol: intent.symbol,
                exchange: intent.exchange,
                assetType: intent.segment,
                tradeType: intent.tradeType || null,
                side: intent.side,
                entryPrice: intent.price,
                quantity: intent.quantity,
                stopLoss: intent.stopLoss || null,
                takeProfit: intent.takeProfit || null,
                status: "OPEN",
            },
        });

        console.log("[PAPER_EXECUTOR] Paper position created", {
            positionId: position.id,
            symbol: position.symbol,
            side: position.side,
            quantity: position.quantity,
            entryPrice: position.entryPrice,
        });

        // 6. Update paper balance
        if (intent.side === "BUY") {
            // Lock capital for BUY
            await prisma.paperBalance.update({
                where: {
                    userId_exchange_assetType_asset: {
                        userId: intent.userId,
                        exchange: intent.exchange,
                        assetType: intent.segment,
                        asset: baseAsset,
                    },
                },
                data: {
                    lockedBalance: balance.lockedBalance + requiredCapital,
                },
            });

            console.log("[PAPER_EXECUTOR] Balance locked for BUY", {
                lockedAmount: requiredCapital,
                newLockedBalance: balance.lockedBalance + requiredCapital,
            });
        } else if (intent.side === "SELL") {
            // For SELL, we need to find and close existing position
            // This is handled by the strategy runtime, so we just create the position record
            console.log("[PAPER_EXECUTOR] SELL position created (will be closed by strategy)");
        }

        return { success: true, position };
    } catch (error: any) {
        console.error("[PAPER_EXECUTOR] Error executing paper trade", {
            error: error.message,
            stack: error.stack,
        });
        return { success: false, error: error.message };
    }
}

/**
 * Validate a paper trade before execution
 */
async function validatePaperTrade(
    intent: TradeIntent
): Promise<ValidationResult> {
    // Basic validation
    if (!intent.symbol || !intent.side || !intent.quantity || !intent.price) {
        return { valid: false, error: "Missing required fields" };
    }

    if (intent.quantity <= 0) {
        return { valid: false, error: "Quantity must be greater than 0" };
    }

    if (intent.price <= 0) {
        return { valid: false, error: "Price must be greater than 0" };
    }

    // Validate leverage for futures
    if (intent.tradeType === "FUTURES" && intent.segment === "CRYPTO") {
        // Leverage validation is handled by strategy config
        // Just ensure it's within reasonable bounds if provided
        const leverage = (intent as any).leverage || 1;
        if (leverage < 1 || leverage > 20) {
            return { valid: false, error: "Leverage must be between 1x and 20x" };
        }
    }

    return { valid: true };
}

/**
 * Get or create paper balance for a user
 */
async function getPaperBalance(
    userId: string,
    exchange: string,
    assetType: string,
    asset: string
) {
    let balance = await prisma.paperBalance.findUnique({
        where: {
            userId_exchange_assetType_asset: {
                userId,
                exchange,
                assetType,
                asset,
            },
        },
    });

    if (!balance) {
        // Create default balance
        const defaultBalance = getDefaultBalance(assetType);
        balance = await prisma.paperBalance.create({
            data: {
                userId,
                exchange,
                assetType,
                asset,
                balance: defaultBalance,
                lockedBalance: 0,
            },
        });

        console.log("[PAPER_EXECUTOR] Created default paper balance", {
            userId,
            exchange,
            assetType,
            asset,
            balance: defaultBalance,
        });
    }

    return balance;
}

/**
 * Get default starting balance based on asset type
 */
function getDefaultBalance(assetType: string): number {
    switch (assetType) {
        case "CRYPTO":
            return 10000; // 10,000 USDT
        case "STOCK":
            return 100000; // 100,000 INR
        default:
            return 10000;
    }
}

/**
 * Extract base asset from symbol
 * e.g., BTCUSDT -> USDT, RELIANCE -> INR
 */
function getBaseAsset(symbol: string, assetType: string): string {
    if (assetType === "CRYPTO") {
        // Most crypto pairs end with USDT, BUSD, or BTC
        if (symbol.endsWith("USDT")) return "USDT";
        if (symbol.endsWith("BUSD")) return "BUSD";
        if (symbol.endsWith("BTC")) return "BTC";
        if (symbol.endsWith("ETH")) return "ETH";
        return "USDT"; // Default
    } else {
        // Stocks use local currency
        return "INR"; // Default for Indian stocks
    }
}

/**
 * Simulate order fill (instant fill at market price for MVP)
 */
export function simulateOrderFill(intent: TradeIntent) {
    return {
        filledQuantity: intent.quantity,
        averagePrice: intent.price,
        fillTime: new Date(),
    };
}
