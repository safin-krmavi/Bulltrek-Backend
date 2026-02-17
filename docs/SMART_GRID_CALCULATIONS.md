# Smart Grid Calculation Documentation

This document explains how Smart Grid parameters are calculated to help you understand and verify the values.

## Overview

Smart Grid automatically calculates optimal trading parameters based on historical market data and technical indicators. The calculation follows a 6-step process:

1. Fetch Historical Data
2. Calculate Technical Indicators
3. Calculate Grid Limits (Price Range)
4. Calculate Optimal Grid Levels
5. Calculate Profit Percentage
6. Validate Configuration

---

## Step 1: Fetch Historical Data

**Purpose**: Gather market data to analyze price behavior

**Input Parameters**:
- `exchange`: BINANCE, KUCOIN, or COINDCX
- `symbol`: Trading pair (e.g., BTCUSDT)
- `dataSetDays`: Number of days to analyze (e.g., 30, 90, 180)
- `segment`: SPOT or FUTURES

**Data Fetched**:
- Open, High, Low, Close prices for each day
- Historical High: Maximum price in the period
- Historical Low: Minimum price in the period

**Example**:
```
Symbol: BTCUSDT
Days: 30
Historical High: $52,100
Historical Low: $48,500
```

---

## Step 2: Calculate Technical Indicators

### 2.1 Bollinger Bands

**Purpose**: Identify price volatility and potential support/resistance levels

**Formula**:
```
Middle Band = SMA(20) = Average of last 20 closing prices
Standard Deviation = √(Σ(price - middle)² / 20)
Upper Band = Middle + (2 × Standard Deviation)
Lower Band = Middle - (2 × Standard Deviation)
```

**Example**:
```
Close prices (last 20 days): [50000, 50200, 49800, ...]
Middle Band: $50,500
Standard Deviation: $800
Upper Band: $50,500 + (2 × $800) = $52,100
Lower Band: $50,500 - (2 × $800) = $48,900
```

### 2.2 Average True Range (ATR)

**Purpose**: Measure market volatility

**Formula**:
```
True Range = max(
  High - Low,
  |High - Previous Close|,
  |Low - Previous Close|
)
ATR(14) = Average of last 14 True Ranges
```

**Example**:
```
True Ranges: [500, 600, 450, 700, ...]
ATR: $550
```

### 2.3 Volatility Factor

**Purpose**: Express volatility as a percentage of current price

**Formula**:
```
Volatility Factor = (ATR / Current Price) × 100
```

**Example**:
```
ATR: $550
Current Price: $51,000
Volatility Factor = (550 / 51000) × 100 = 1.08%
```

### 2.4 Risk Level

**Purpose**: Categorize market risk

**Rules**:
```
Volatility < 2%  → LOW risk
Volatility < 5%  → MEDIUM risk
Volatility ≥ 5%  → HIGH risk
```

**Example**:
```
Volatility Factor: 1.08%
Risk Level: LOW
```

---

## Step 3: Calculate Grid Limits (Price Range)

### 3.1 Auto-Calculated Limits

**Purpose**: Define the price range where grid orders will be placed

**Formula**:
```
Buffer Percent = max(5%, min(15%, Volatility Factor × 2))
Buffer = ATR × (Buffer Percent / 100)

Lower Limit = max(
  Historical Low × 0.95,
  min(Bollinger Lower - Buffer, Current Price × 0.9)
)

Upper Limit = min(
  Historical High × 1.05,
  max(Bollinger Upper + Buffer, Current Price × 1.1)
)
```

**Example**:
```
Volatility Factor: 1.08%
Buffer Percent: max(5%, min(15%, 1.08 × 2)) = 5%
Buffer: $550 × 0.05 = $27.50

Lower Limit = max(
  $48,500 × 0.95 = $46,075,
  min($48,900 - $27.50 = $48,872.50, $51,000 × 0.9 = $45,900)
) = $46,075

Upper Limit = min(
  $52,100 × 1.05 = $54,705,
  max($52,100 + $27.50 = $52,127.50, $51,000 × 1.1 = $56,100)
) = $52,127.50
```

### 3.2 User-Provided Limits

If you provide `userLowerLimit` and `userUpperLimit`, those values are used directly instead of auto-calculation.

---

## Step 4: Calculate Optimal Grid Levels

### 4.1 Minimum Investment Per Grid

**Purpose**: Ensure each grid order meets exchange requirements

**Formula**:
```
Exchange Minimum (USD):
- BINANCE SPOT: $10
- BINANCE FUTURES: $5
- KUCOIN: $1
- COINDCX: $10

Percentage-Based Minimum = Total Investment × 0.02 (2%)

Minimum Investment = max(Exchange Minimum, Percentage-Based Minimum)
```

**Example**:
```
Exchange: BINANCE SPOT
Total Investment: $1,000
Exchange Minimum: $10
Percentage-Based: $1,000 × 0.02 = $20
Minimum Investment = max($10, $20) = $20
```

### 4.2 Calculate Grid Levels

**Purpose**: Determine how many price levels to create

**Formula**:
```
Price Range = Upper Limit - Lower Limit
Optimal Spacing = Price Range × 0.02 (2% of range)
Optimal Levels = ⌈Price Range / Optimal Spacing⌉

Max Affordable Levels = ⌊Total Investment / Minimum Investment⌋

Safe Levels = min(Optimal Levels, Max Affordable Levels)
Final Levels = min(max(5, Safe Levels), 50)
```

**Example**:
```
Price Range: $52,127.50 - $46,075 = $6,052.50
Optimal Spacing: $6,052.50 × 0.02 = $121.05
Optimal Levels: ⌈6052.50 / 121.05⌉ = 50

Total Investment: $1,000
Minimum Investment: $20
Max Affordable Levels: ⌊1000 / 20⌋ = 50

Safe Levels: min(50, 50) = 50
Final Levels: min(max(5, 50), 50) = 50
```

### 4.3 Per Grid Amount

**Formula**:
```
Per Grid Amount = Total Investment / Levels
```

**Example**:
```
Total Investment: $1,000
Levels: 50
Per Grid Amount: $1,000 / 50 = $20
```

---

## Step 5: Calculate Profit Percentage

**Purpose**: Determine profit target for each grid trade

**Formula**:
```
Grid Spacing = (Upper Limit - Lower Limit) / Levels
Spacing Percent = (Grid Spacing / Lower Limit) × 100
Base Profit Percent = Spacing Percent × 0.5 × max(1, Volatility Factor / 3)
Profit Percentage = max(0.5%, min(10%, Base Profit Percent))
```

**Example**:
```
Grid Spacing: $6,052.50 / 50 = $121.05
Spacing Percent: ($121.05 / $46,075) × 100 = 0.26%
Volatility Factor: 1.08%
Base Profit: 0.26% × 0.5 × max(1, 1.08 / 3) = 0.13%
Profit Percentage: max(0.5%, min(10%, 0.13%)) = 0.5%
```

---

## Step 6: Validation

### 6.1 Investment Consistency Check

**Rule**: `perGridAmount × levels` must equal `investment`

**Example**:
```
Per Grid Amount: $20
Levels: 50
Calculated Investment: $20 × 50 = $1,000 ✓
User Investment: $1,000 ✓
```

### 6.2 Minimum Investment Check

**Rule**: `perGridAmount` must be ≥ `minimumInvestment`

**Example**:
```
Per Grid Amount: $20
Minimum Investment: $20 ✓
```

### 6.3 Grid Spacing Check

**Rule**: Grid spacing must be ≥ 0.1% of lower limit

**Formula**:
```
Grid Spacing = (Upper Limit - Lower Limit) / Levels
Min Spacing = Lower Limit × 0.001
```

**Example**:
```
Grid Spacing: $121.05
Min Spacing: $46,075 × 0.001 = $46.08
$121.05 ≥ $46.08 ✓
```

---

## User Override Options

You can override auto-calculated values by providing:

### Option 1: Investment + Levels
```json
{
  "userInvestment": 1000,
  "userLevels": 40
}
```
**Result**: `perGridAmount = 1000 / 40 = $25`

### Option 2: Investment + Per Grid Amount
```json
{
  "userInvestment": 1000,
  "userPerGridAmount": 25
}
```
**Result**: `levels = 1000 / 25 = 40`

### Option 3: Per Grid Amount + Levels
```json
{
  "userPerGridAmount": 25,
  "userLevels": 40
}
```
**Result**: `investment = 25 × 40 = $1000`

### Option 4: Custom Limits
```json
{
  "userLowerLimit": 45000,
  "userUpperLimit": 55000
}
```
**Result**: Uses your specified price range instead of auto-calculation

---

## Complete Example

**Input**:
```json
{
  "exchange": "BINANCE",
  "segment": "SPOT",
  "symbol": "BTCUSDT",
  "dataSetDays": 30,
  "userInvestment": 1000
}
```

**Step-by-Step Calculation**:

1. **Historical Data** (30 days):
   - Historical High: $52,100
   - Historical Low: $48,500
   - Current Price: $51,000

2. **Indicators**:
   - Bollinger Upper: $52,100
   - Bollinger Lower: $48,900
   - ATR: $550
   - Volatility Factor: 1.08%
   - Risk Level: LOW

3. **Grid Limits**:
   - Lower Limit: $46,075
   - Upper Limit: $52,127.50
   - Price Range: $6,052.50

4. **Grid Levels**:
   - Minimum Investment: $20
   - Optimal Levels: 50
   - Max Affordable: 50
   - Final Levels: 50
   - Per Grid Amount: $20

5. **Profit Percentage**: 0.5%

6. **Validation**: ✓ All checks passed

**Final Configuration**:
```json
{
  "lowerLimit": 46075,
  "upperLimit": 52127.50,
  "levels": 50,
  "profitPercentage": 0.5,
  "investment": 1000,
  "perGridAmount": 20,
  "minimumInvestment": 20,
  "indicators": {
    "volatilityFactor": 1.08,
    "riskLevel": "LOW"
  }
}
```

