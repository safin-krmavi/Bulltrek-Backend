// sockets/crypto/marketData/binanceKlineHandler.ts
import WebSocket from "ws";
import { CryptoTradeType } from "@prisma/client";
import { CandleBuffer, Candle } from "./candleBuffer";
import { EventEmitter } from "events";

/**
 * Binance Kline (Candlestick) WebSocket Handler
 * Subscribes to individual symbol kline streams
 */
class BinanceKlineHandlerClass extends EventEmitter {
    private connections: Map<string, WebSocket> = new Map();

    /**
     * Generate unique key for connection
     */
    private getKey(
        segment: CryptoTradeType,
        symbol: string,
        timeframe: string
    ): string {
        return `${segment}:${symbol}:${timeframe}`;
    }

    /**
     * Connect to Binance kline stream for a specific symbol and timeframe
     */
    async connect(
        segment: CryptoTradeType,
        symbol: string,
        timeframe: string
    ): Promise<void> {
        const key = this.getKey(segment, symbol, timeframe);

        // Check if already connected
        if (this.connections.has(key)) {
            console.log("[BINANCE_KLINE] Already connected", {
                segment,
                symbol,
                timeframe,
            });
            return;
        }

        // Build WebSocket URL
        const symbolLower = symbol.toLowerCase();
        const wsUrl =
            segment === "SPOT"
                ? `wss://stream.binance.com:9443/ws/${symbolLower}@kline_${timeframe}`
                : `wss://fstream.binance.com/ws/${symbolLower}@kline_${timeframe}`;

        console.log("[BINANCE_KLINE] Connecting", {
            segment,
            symbol,
            timeframe,
            url: wsUrl,
        });

        const ws = new WebSocket(wsUrl);

        ws.on("open", () => {
            console.log("[BINANCE_KLINE] Connected", {
                segment,
                symbol,
                timeframe,
            });
        });

        ws.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());

                // Binance kline message structure
                if (message.e === "kline" && message.k) {
                    const kline = message.k;

                    const candle: Candle = {
                        time: kline.t, // Open time
                        open: parseFloat(kline.o),
                        high: parseFloat(kline.h),
                        low: parseFloat(kline.l),
                        close: parseFloat(kline.c),
                        volume: parseFloat(kline.v),
                    };

                    // Only process closed candles
                    if (kline.x === true) {
                        console.log("[BINANCE_KLINE] Candle closed", {
                            segment,
                            symbol,
                            timeframe,
                            time: new Date(candle.time).toISOString(),
                            close: candle.close,
                        });

                        // Add to buffer
                        CandleBuffer.addCandle("BINANCE", segment, symbol, candle);

                        // Emit event for strategy evaluation
                        this.emit("candleClose", {
                            exchange: "BINANCE",
                            segment,
                            symbol,
                            timeframe,
                            candle,
                        });
                    } else {
                        // Update current (incomplete) candle
                        this.emit("candleUpdate", {
                            exchange: "BINANCE",
                            segment,
                            symbol,
                            timeframe,
                            candle,
                        });
                    }
                }
            } catch (err) {
                console.error("[BINANCE_KLINE] Parse error", {
                    segment,
                    symbol,
                    timeframe,
                    error: err,
                });
            }
        });

        ws.on("error", (error) => {
            console.error("[BINANCE_KLINE] WebSocket error", {
                segment,
                symbol,
                timeframe,
                error,
            });
        });

        ws.on("close", (code, reason) => {
            console.log("[BINANCE_KLINE] WebSocket closed", {
                segment,
                symbol,
                timeframe,
                code,
                reason: reason.toString(),
            });

            // Remove from connections
            this.connections.delete(key);
        });

        // Store connection
        this.connections.set(key, ws);
    }

    /**
     * Disconnect from a kline stream
     */
    disconnect(
        segment: CryptoTradeType,
        symbol: string,
        timeframe: string
    ): void {
        const key = this.getKey(segment, symbol, timeframe);
        const ws = this.connections.get(key);

        if (ws) {
            ws.close();
            this.connections.delete(key);

            console.log("[BINANCE_KLINE] Disconnected", {
                segment,
                symbol,
                timeframe,
            });
        }
    }

    /**
     * Disconnect all streams
     */
    disconnectAll(): void {
        for (const [key, ws] of this.connections.entries()) {
            ws.close();
            console.log("[BINANCE_KLINE] Disconnected", { key });
        }
        this.connections.clear();
    }

    /**
     * Get active connections
     */
    getActiveConnections(): string[] {
        return Array.from(this.connections.keys());
    }
}

export const BinanceKlineHandler = new BinanceKlineHandlerClass();
