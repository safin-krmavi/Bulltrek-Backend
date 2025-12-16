import express from "express";
import * as cryptoUserController from "../../controllers/crypto/userController";
import { verifyCryptoUser } from "../../middleware/crypto/authMiddleware";
const cryptoUserRouter = express.Router();
cryptoUserRouter.use(express.json());

cryptoUserRouter.post("/signup", cryptoUserController.signupController);
cryptoUserRouter.post("/verify", cryptoUserController.verifyController); // Dev mode
cryptoUserRouter.post("/login", cryptoUserController.loginController);
cryptoUserRouter.put(
  "/update",
  verifyCryptoUser,
  cryptoUserController.updateUserController
);
cryptoUserRouter.get(
  "/me",
  verifyCryptoUser,
  cryptoUserController.getUserController
);
cryptoUserRouter.delete(
  "/delete",
  verifyCryptoUser,
  cryptoUserController.deleteUserController
);

// 2FA
cryptoUserRouter.post(
  "/2fa/initiate",
  verifyCryptoUser,
  cryptoUserController.initiateTwoFactorAuthController
);

cryptoUserRouter.post(
  "/2fa/confirm",
  verifyCryptoUser,
  cryptoUserController.confirmTwoFactorAuthController
);

cryptoUserRouter.post(
  "/2fa/verify-login",
  cryptoUserController.verifyTwoFactorLoginController
);

export default cryptoUserRouter;
