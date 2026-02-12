// sockets/crypto/marketData/candleBuffer.ts

export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Manages candle buffers for each symbol
 * Stores up to MAX_CANDLES per symbol for indicator calculations
 */
class CandleBufferManager {
    private static instance: CandleBufferManager;
    private buffers: Map<string, Candle[]> = new Map();
    private readonly MAX_CANDLES = 500; // Enough for ATR 300 + buffer

    private constructor() { }

    static getInstance(): CandleBufferManager {
        if (!CandleBufferManager.instance) {
            CandleBufferManager.instance = new CandleBufferManager();
        }
        return CandleBufferManager.instance;
    }

    /**
     * Generate unique key for exchange-segment-symbol combination
     */
    private getKey(exchange: string, segment: string, symbol: string): string {
        return `${exchange}:${segment}:${symbol}`;
    }

    /**
     * Initialize buffer with historical candles
     */
    initialize(
        exchange: string,
        segment: string,
        symbol: string,
        candles: Candle[]
    ): void {
        const key = this.getKey(exchange, segment, symbol);

        // Sort by time ascending
        const sorted = [...candles].sort((a, b) => a.time - b.time);

        // Keep only last MAX_CANDLES
        const trimmed = sorted.slice(-this.MAX_CANDLES);

        this.buffers.set(key, trimmed);

        console.log("[CANDLE_BUFFER] Initialized", {
            exchange,
            segment,
            symbol,
            candleCount: trimmed.length,
            oldestCandle: new Date(trimmed[0]?.time || 0).toISOString(),
            newestCandle: new Date(trimmed[trimmed.length - 1]?.time || 0).toISOString(),
        });
    }

    /**
     * Add a new candle to the buffer
     */
    addCandle(
        exchange: string,
        segment: string,
        symbol: string,
        candle: Candle
    ): void {
        const key = this.getKey(exchange, segment, symbol);

        let buffer = this.buffers.get(key);

        if (!buffer) {
            buffer = [];
            this.buffers.set(key, buffer);
        }

        // Add new candle
        buffer.push(candle);

        // Trim to MAX_CANDLES
        if (buffer.length > this.MAX_CANDLES) {
            buffer.shift(); // Remove oldest
        }

        console.log("[CANDLE_BUFFER] Added candle", {
            exchange,
            segment,
            symbol,
            time: new Date(candle.time).toISOString(),
            close: candle.close,
            bufferSize: buffer.length,
        });
    }

    /**
     * Get last N candles
     */
    getCandles(
        exchange: string,
        segment: string,
        symbol: string,
        count?: number
    ): Candle[] {
        const key = this.getKey(exchange, segment, symbol);
        const buffer = this.buffers.get(key) || [];

        if (count === undefined) {
            return [...buffer]; // Return all
        }

        return buffer.slice(-count); // Return last N
    }

    /**
     * Get candle count for a symbol
     */
    getCandleCount(exchange: string, segment: string, symbol: string): number {
        const key = this.getKey(exchange, segment, symbol);
        return this.buffers.get(key)?.length || 0;
    }

    /**
     * Check if buffer has enough candles for calculation
     */
    hasEnoughCandles(
        exchange: string,
        segment: string,
        symbol: string,
        required: number
    ): boolean {
        return this.getCandleCount(exchange, segment, symbol) >= required;
    }

    /**
     * Clear buffer for a symbol
     */
    clear(exchange: string, segment: string, symbol: string): void {
        const key = this.getKey(exchange, segment, symbol);
        this.buffers.delete(key);

        console.log("[CANDLE_BUFFER] Cleared", {
            exchange,
            segment,
            symbol,
        });
    }

    /**
     * Get all active buffers (for debugging)
     */
    getActiveBuffers(): string[] {
        return Array.from(this.buffers.keys());
    }
}

export const CandleBuffer = CandleBufferManager.getInstance();
