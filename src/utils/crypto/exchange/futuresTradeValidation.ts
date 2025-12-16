export function validateFuturesTrade(payload: any) {
  const { symbol, side, quantity, orderType, leverage } = payload;

  if (!symbol || !side || !quantity || !orderType) {
    throw {
      code: "BAD_REQUEST",
      message: "symbol, side, quantity and orderType are required",
    };
  }

  if (!leverage) {
    throw {
      code: "BAD_REQUEST",
      message: "leverage is required for futures trades",
    };
  }

  if (orderType === "LIMIT" && payload.price == null) {
    throw {
      code: "BAD_REQUEST",
      message: "price is required for LIMIT futures orders",
    };
  }
}
