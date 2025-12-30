import express from "express";
import * as stockExchangeController from "../../controllers/stocks/exchange/exchangeController";
import { verifyStocksUser } from "../../middleware/stocks/authMiddleware";

const exchangeRouter = express.Router();

exchangeRouter.get(
  "/symbol-pairs",
  stockExchangeController.fetchStocksSymbolPairsController
);
exchangeRouter.put(
  "/symbol-pairs",
  stockExchangeController.updateStockSymbolPairsController
);

exchangeRouter.post(
  "/login-url",
  verifyStocksUser,
  stockExchangeController.getStockLoginUrlController
);

exchangeRouter.get(
  "/zerodha/callback",
  stockExchangeController.zerodhaCallbackController
);

exchangeRouter.post(
  "/angelone/callback",
  stockExchangeController.angelOneCallbackController
);

/**
 * Login / connect stock exchange using payload (accessToken, requestToken, etc.)
 */
exchangeRouter.post(
  "/login",
  verifyStocksUser,
  stockExchangeController.loginStockExchangeController
);

/**
 * Verify stock exchange API keys
 */
exchangeRouter.post(
  "/verify-keys",
  verifyStocksUser,
  stockExchangeController.verifyStockKeysController
);

/**
 * Fetch stock balances
 */
exchangeRouter.post(
  "/balances",
  verifyStocksUser,
  stockExchangeController.getStockBalancesController
);

/**
 * Place stock order
 */
exchangeRouter.post(
  "/order",
  verifyStocksUser,
  stockExchangeController.placeStockOrderController
);

/**
 * Fetch stock positions
 */
exchangeRouter.post(
  "/positions",
  verifyStocksUser,
  stockExchangeController.getStockPositionsController
);


exchangeRouter.get(
  "/zerodha/instruments",
  stockExchangeController.getZerodhaInstrumentsController
);

/**
 * Get Zerodha instrument by token
 */
exchangeRouter.get(
  "/zerodha/instruments/:instrumentToken",
  stockExchangeController.getZerodhaInstrumentByTokenController
);

/**
 * Get Zerodha instrument by symbol
 */
exchangeRouter.get(
  "/zerodha/instrument",
  stockExchangeController.getZerodhaInstrumentBySymbolController
);

/**
 * Get connected exchanges for user
 */
exchangeRouter.get(
  "/connected",
  stockExchangeController.getConnectedExchangesController
);

export default exchangeRouter;
