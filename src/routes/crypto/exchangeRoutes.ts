import express from "express";
import { verifyCryptoUser } from "../../middleware/crypto/authMiddleware";
import * as cryptoExchangeController from "../../controllers/crypto/exchange/exchangeController";
import { verifyCryptoAdmin } from "../../middleware/crypto/isAdminMiddleware";

const exchangeRouter = express.Router();

exchangeRouter.get(
  "/symbol-pairs",
  cryptoExchangeController.fetchSymbolPairsController
);

exchangeRouter.put(
  "/symbol-pairs",
  verifyCryptoAdmin,
  cryptoExchangeController.updateSymbolPairsController
);

// Verify exchange creds
exchangeRouter.post(
  "/verify-keys",
  verifyCryptoUser,
  cryptoExchangeController.verifyExchangeCredentialsController
);

// Verify exchange creds
exchangeRouter.post(
  "/get-balances",
  verifyCryptoUser,
  cryptoExchangeController.getBalancesController
);

export default exchangeRouter;
