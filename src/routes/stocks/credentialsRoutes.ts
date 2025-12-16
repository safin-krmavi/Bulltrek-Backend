import express from "express";
import * as credentialsController from "../../controllers/stocks/credentialsController";
import { verifyStocksUser } from "../../middleware/stocks/authMiddleware";

const router = express.Router();

router.post(
  "/",
  verifyStocksUser,
  credentialsController.addOrUpdateCredentialsController
);
router.get(
  "/:userId",
  verifyStocksUser,
  credentialsController.getCredentialsController
);
router.put(
  "/:id",
  verifyStocksUser,
  credentialsController.updateCredentialsController
);
router.delete(
  "/:id",
  verifyStocksUser,
  credentialsController.deleteCredentialsController
);

export default router;
