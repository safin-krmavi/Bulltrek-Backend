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

exchangeRouter.get(
  "/symbol-precision",
  cryptoExchangeController.getExchangePrecisionController
);

exchangeRouter.put(
  "/symbol-precision",
  cryptoExchangeController.refreshSymbolMetaController
);

// Verify exchange credentials
exchangeRouter.post(
  "/verify-keys",
  verifyCryptoUser,
  cryptoExchangeController.verifyExchangeCredentialsController
);

// Get balances
exchangeRouter.post(
  "/get-balances",
  verifyCryptoUser,
  cryptoExchangeController.getBalancesController
);

/**
 * Search crypto symbols across all exchanges and segments
 * Used for dropdown/autocomplete - supports partial matching
 */
exchangeRouter.get(
  "/search",
  cryptoExchangeController.searchSymbolsController
);

/**
 * Get crypto symbol by exact symbol name
 * Example: BTCUSDT, ETHUSDT, PUMPBTCUSDT
 */
exchangeRouter.get(
  "/symbol",
  cryptoExchangeController.getSymbolByNameController
);

export default exchangeRouter;
