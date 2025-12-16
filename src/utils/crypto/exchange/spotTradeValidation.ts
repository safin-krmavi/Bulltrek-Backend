import { mapSpotOrderTypeToCoinDCX } from "./coindcxUtils";

export function validateSpotTrade(payload: any) {
  const { symbol, side, quantity, orderType, price } = payload;

  if (!symbol || !side || !quantity || !orderType) {
    throw {
      code: "BAD_REQUEST",
      message: "symbol, side, quantity and orderType are required",
    };
  }

  if (orderType === "LIMIT" && price == null) {
    throw {
      code: "BAD_REQUEST",
      message: "price is required for LIMIT spot orders",
    };
  }

  return payload;
}
