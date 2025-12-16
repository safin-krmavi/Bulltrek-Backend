import express from "express";
import * as credentialsController from "../../controllers/crypto/credentialsController";
import { verifyCryptoUser } from "../../middleware/crypto/authMiddleware";

const credentialsRouter = express.Router();

credentialsRouter.post(
  "/",
  verifyCryptoUser,
  credentialsController.addOrUpdateCredentialsController
);

credentialsRouter.get(
  "/:userId",
  verifyCryptoUser,
  credentialsController.getCredentialsController
);

credentialsRouter.put(
  "/:id",
  verifyCryptoUser,
  credentialsController.updateCredentialsController
);
credentialsRouter.delete(
  "/:id",
  verifyCryptoUser,
  credentialsController.deleteCredentialsController
);

export default credentialsRouter;
