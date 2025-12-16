import express from "express";
import { verifyCryptoUser } from "../../middleware/crypto/authMiddleware";
import * as cryptoTradeController from "../../controllers/crypto/exchange/tradeController";

const tradeRouter = express.Router();

tradeRouter.post(
  "/create",
  verifyCryptoUser,
  cryptoTradeController.createTradeController
);
tradeRouter.post(
  "/futures/active-positions",
  verifyCryptoUser,
  cryptoTradeController.getActiveFuturesPositionsController
);
export default tradeRouter;
