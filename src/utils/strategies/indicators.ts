// import { Candle } from "./historicalDataFetcher";

// /* -------------------------------------------------------------------------- */
// /*                                 CORE MATH                                  */
// /* -------------------------------------------------------------------------- */

// /**
//  * Calculate Simple Moving Average (SMA)
//  */
// function calculateSMA(values: number[], period: number): number[] {
//   const sma: number[] = [];
//   for (let i = 0; i < values.length; i++) {
//     if (i < period - 1) {
//       sma.push(NaN);
//       continue;
//     }
//     const slice = values.slice(i - period + 1, i + 1);
//     const sum = slice.reduce((a, b) => a + b, 0);
//     sma.push(sum / period);
//   }
//   return sma;
// }

// /**
//  * Calculate Exponential Moving Average (EMA)
//  */
// function calculateEMA(values: number[], period: number): number[] {
//   const k = 2 / (period + 1);
//   const ema: number[] = [];
  
//   // Initialize with SMA
//   let initialSMA = 0;
//   for (let i = 0; i < period; i++) {
//     initialSMA += values[i];
//   }
//   initialSMA /= period;

//   for (let i = 0; i < values.length; i++) {
//     if (i < period - 1) {
//       ema.push(NaN);
//     } else if (i === period - 1) {
//       ema.push(initialSMA);
//     } else {
//       const prevEMA = ema[i - 1];
//       const currentEMA = (values[i] - prevEMA) * k + prevEMA;
//       ema.push(currentEMA);
//     }
//   }
//   return ema;
// }

// /**
//  * Calculate True Range (TR)
//  */
// function calculateTrueRange(current: Candle, previous: Candle): number {
//   if (!previous) return current.high - current.low;
  
//   const hl = current.high - current.low;
//   const hpc = Math.abs(current.high - previous.close);
//   const lpc = Math.abs(current.low - previous.close);
  
//   return Math.max(hl, hpc, lpc);
// }

// /**
//  * Calculate Average True Range (ATR)
//  * Uses RMA (Wilder's Smoothing) logic typically used in TradingView
//  */
// export function calculateATR(candles: Candle[], period: number): number[] {
//   const atr: number[] = [];
//   let trSum = 0;
  
//   // Calculate initial TRs
//   const trs: number[] = [];
//   for (let i = 0; i < candles.length; i++) {
//     const tr = calculateTrueRange(candles[i], candles[i - 1]);
//     trs.push(tr);
//   }

//   // Initial ATR is SMA of TR
//   let initialATR = 0;
//   for (let i = 0; i < period; i++) {
//     initialATR += trs[i];
//   }
//   initialATR /= period;

//   for (let i = 0; i < candles.length; i++) {
//     if (i < period - 1) {
//       atr.push(NaN);
//     } else if (i === period - 1) {
//       atr.push(initialATR);
//     } else {
//       // RMA formula: (Prior ATR * (period - 1) + Current TR) / period
//       const prevATR = atr[i - 1];
//       const currentTR = trs[i];
//       const currentATR = (prevATR * (period - 1) + currentTR) / period;
//       atr.push(currentATR);
//     }
//   }
  
//   return atr;
// }

// /* -------------------------------------------------------------------------- */
// /*                                UT BOT LOGIC                                */
// /* -------------------------------------------------------------------------- */

// export interface UTBotResult {
//   buySignal: boolean;
//   sellSignal: boolean;
//   trailingStop: number;
//   position: "LONG" | "SHORT";
// }

// /**
//  * UT Bot Alert Indicator
//  * Based on QuantNomad's implementation
//  */
// export function calculateUTBot(
//   candles: Candle[], 
//   keyValue: number, 
//   atrPeriod: number
// ): UTBotResult[] {
//   const results: UTBotResult[] = [];
//   const closePrices = candles.map(c => c.close);
//   const atr = calculateATR(candles, atrPeriod);
  
//   let trailingStop = 0;
//   let position: "LONG" | "SHORT" = "LONG"; // Default assumption, will correct itself
  
//   // Initialize with safe values
//   for (let i = 0; i < candles.length; i++) {
//     if (i < atrPeriod) {
//       results.push({ buySignal: false, sellSignal: false, trailingStop: 0, position: "LONG" });
//       continue;
//     }

//     const close = closePrices[i];
//     const prevClose = closePrices[i - 1];
//     const xATRTrailingStop = keyValue * atr[i];
    
//     // Logic from TradingView / Python ports
//     let prevTrailingStop = results[i - 1].trailingStop; // Previous iteration value
    
//     // Calculate potential stops
//     // For Long: invalid if price drops below (handled by logic below)
//     // Basic logic:
//     // If price > prevStop, newStop = max(prevStop, close - nATR)
//     // If price < prevStop, newStop = min(prevStop, close + nATR)
    
//     // Correct TradingView Logic:
//     // nLoss = keyvalue * atr
//     // xATRTrailingStop = 
//     //   iff(src > nz(xATRTrailingStop[1], 0) and src[1] > nz(xATRTrailingStop[1], 0), max(nz(xATRTrailingStop[1]), src - nLoss),
//     //   iff(src < nz(xATRTrailingStop[1], 0) and src[1] < nz(xATRTrailingStop[1], 0), min(nz(xATRTrailingStop[1]), src + nLoss), 
//     //   iff(src > nz(xATRTrailingStop[1], 0), src - nLoss, src + nLoss)))
    
//     // Simplified logic:
//     const nLoss = xATRTrailingStop;
    
//     if (i === atrPeriod) {
//       // First calculation
//       trailingStop = close - nLoss; 
//     } else {
//         // If current Close > prevTrailingStop AND prev Close > prevTrailingStop
//         if (close > prevTrailingStop && prevClose > prevTrailingStop) {
//             trailingStop = Math.max(prevTrailingStop, close - nLoss);
//         }
//         // If current Close < prevTrailingStop AND prev Close < prevTrailingStop
//         else if (close < prevTrailingStop && prevClose < prevTrailingStop) {
//             trailingStop = Math.min(prevTrailingStop, close + nLoss);
//         }
//         // Crossover
//         else if (close > prevTrailingStop) {
//             trailingStop = close - nLoss;
//         }
//         else {
//             trailingStop = close + nLoss;
//         }
//     }

//     // Signals
//     // Buy: when price crosses over trailing stop (actually when trailing stop jumps down? or price crosses it?)
//     // Real logic: 
//     // ema = 1 (just check crossovers of price vs trailing stop isn't enough, need state)
//     // pos = 
//     //   iff(close[1] < nz(xATRTrailingStop[1]) and close > nz(xATRTrailingStop[1]), 1,
//     //   iff(close[1] > nz(xATRTrailingStop[1]) and close < nz(xATRTrailingStop[1]), -1, nz(pos[1], 0)))
    
//     let currentPosition = results[i-1].position;
//     let buySignal = false;
//     let sellSignal = false;
    
//     if (prevClose < prevTrailingStop && close > prevTrailingStop) {
//         currentPosition = "LONG";
//         buySignal = true;
//     } else if (prevClose > prevTrailingStop && close < prevTrailingStop) {
//         currentPosition = "SHORT";
//         sellSignal = true;
//     }
    
//     results.push({
//         buySignal,
//         sellSignal,
//         trailingStop,
//         position: currentPosition
//     });
//   }
  
//   return results;
// }

// /* -------------------------------------------------------------------------- */
// /*                            STC (SCHAFF TREND CYCLE)                        */
// /* -------------------------------------------------------------------------- */

// export interface STCResult {
//     stc: number;
//     trend: "BULLISH" | "BEARISH" | "NEUTRAL";
// }

// /**
//  * Calculate STC (Schaff Trend Cycle)
//  * Standard Settings: Length: 80, Fast: 27, Slow: 50 (usually derived), Factor: 0.5
//  * Inputs: Length (80), FastLength (27), SlowLength (12?? No, usually MACD settings are 12, 26. STC uses specific ones)
//  * User Prompt says: Length (80), Fast Length (27). Implicit Slow Length?
//  * TradingView Default STC: 
//  * cycleLength = 10 (or 80?), 
//  * macdLength1 = 23, macdLength2 = 50.
//  * 
//  * Let's assume User inputs:
//  * Length = Cycle Length (80)
//  * Fast Length = Short MACD Length (27)
//  * Slow Length = Fast Length * 2 (approx, or standard 50 if not provided?)
//  * Let's use 50 as default slow if not specified, or derivation.
//  * 
//  * Logic:
//  * MACD Line = EMA(Fast) - EMA(Slow)
//  * %K = (MACD - Min(MACD, Length)) / (Max(MACD, Length) - Min(MACD, Length)) * 100
//  * %D = EMA(%K, Factor?? usually smooth length)
//  * .... Repeated twice 
//  */
// export function calculateSTC(
//     candles: Candle[], 
//     cycleLength: number = 80, 
//     fastLength: number = 27, 
//     slowLength: number = 50
// ): number [] {
//     // 1. Calculate MACD Line
//     const close = candles.map(c => c.close);
//     const emaFast = calculateEMA(close, fastLength);
//     const emaSlow = calculateEMA(close, slowLength);
    
//     const macdLine: number[] = [];
//     for(let i=0; i<close.length; i++) {
//         macdLine.push(emaFast[i] - emaSlow[i]);
//     }
    
//     // 2. Calculate Unsmoothed Stochastic of MACD (%K)
//     // stoch(val, length)
//     const stochK: number[] = [];
//     for(let i=0; i<macdLine.length; i++) {
//         if(i < cycleLength) {
//             stochK.push(0);
//             continue;
//         }
        
//         // Get window of MACD values
//         // Note: checking if macdLine has enough valid data (EMAs produce NaNs at start)
//         if(isNaN(macdLine[i])) {
//             stochK.push(0);
//             continue;
//         }
        
//         let minVal = Infinity;
//         let maxVal = -Infinity;
        
//         // Look back cycleLength
//         for(let j=0; j<cycleLength; j++) {
//             const val = macdLine[i-j];
//             if(!isNaN(val)) {
//                 if(val < minVal) minVal = val;
//                 if(val > maxVal) maxVal = val;
//             }
//         }
        
//         if (maxVal === minVal) {
//              stochK.push(0);
//         } else {
//              stochK.push(((macdLine[i] - minVal) / (maxVal - minVal)) * 100);
//         }
//     }
    
//     // 3. Smooth %K to get %D (Factor = 0.5 usually)
//     // PF = (PF[1] * (1-factor)) + (%K * factor) ?? 
//     // Trigger = EMA(stochK, smoothLength) ?? 
//     // TradingView script: 
//     // f1(val) => 0.5 * (val - nz(f1[1])) + nz(f1[1]) ?? No, standard EMA format is distinct
//     // Easy logic: EMA of StochK with length = cycleLength/2 ?? 
    
//     // Let's implementation standard STC formula:
//     // Stoch 1
//     // %K1 = (MACD - LowestMACD) / (HighestMACD - LowestMACD) * 100
//     // %D1 = PF * %K1 + (1-PF) * %D1[1]  Assuming PF=0.5
    
//     const factor = 0.5;
    
//     const stochD1: number[] = [];
//     let prevD1 = 0;
    
//     for(let i=0; i<stochK.length; i++) {
//         if (i < cycleLength) {
//             stochD1.push(0);
//             continue;
//         }
//         const k = stochK[i];
//         const d = prevD1 + factor * (k - prevD1);
//         stochD1.push(d);
//         prevD1 = d;
//     }
    
//     // Stoch 2 (Repeat on D1)
//     // %K2 = (D1 - LowestD1) / (HighestD1 - LowestD1) * 100
//     // STC = PF * %K2 + (1-PF) * STC[1]
    
//     const stc: number[] = [];
//     let prevSTC = 0;
    
//     for(let i=0; i<stochD1.length; i++) {
//          if (i < cycleLength * 2) { // Needs more data
//             stc.push(0);
//             continue;
//         }
        
//         // Window on D1
//         let minVal = Infinity;
//         let maxVal = -Infinity;
        
//          for(let j=0; j<cycleLength; j++) {
//             const val = stochD1[i-j];
//             if(val < minVal) minVal = val;
//             if(val > maxVal) maxVal = val;
//         }
        
//         let k2 = 0;
//         if(maxVal > minVal) {
//             k2 = ((stochD1[i] - minVal) / (maxVal - minVal)) * 100;
//         }
        
//         const finalVal = prevSTC + factor * (k2 - prevSTC);
//         stc.push(finalVal);
//         prevSTC = finalVal;
//     }
    
//     return stc;
// }
