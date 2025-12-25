// stockMarketDataRegistry.ts
export const stockMarketDataRegistry: Record<
  string,
  Record<
    string,
    {
      socket: any;
      symbols: Set<string>;
      subscribers: Map<string, Set<string>>;
    }
  >
> = {};

