export function formatSymbols({
  data,
  keys,
}: {
  data: any[];
  keys: {
    symbol: string;
    base: string;
    quote: string;
  };
}) {
  const seen = new Set<string>();

  return data
    .filter((item) => item[keys.quote] === "USDT" || item[keys.quote] === "INR")
    .map((item) => {
      const symbol = item[keys.symbol];
      if (seen.has(symbol)) return null;
      seen.add(symbol);

      return {
        symbol,
        base: item[keys.base],
        quote: item[keys.quote],
      };
    })
    .filter(
      (item): item is { symbol: string; base: string; quote: string } =>
        item !== null
    );
}
