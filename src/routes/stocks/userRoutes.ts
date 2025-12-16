import express from "express";
import * as stocksUserController from "../../controllers/stocks/userController";
import { verifyStocksUser } from "../../middleware/stocks/authMiddleware";

const stocksUserRouter = express.Router();
stocksUserRouter.use(express.json());

stocksUserRouter.post("/signup", stocksUserController.signupController);
stocksUserRouter.post("/verify", stocksUserController.verifyController);
stocksUserRouter.post("/login", stocksUserController.loginController);
stocksUserRouter.put(
  "/update",
  verifyStocksUser,
  stocksUserController.updateUserController
);
stocksUserRouter.get(
  "/me",
  verifyStocksUser,
  stocksUserController.getUserController
);
stocksUserRouter.delete(
  "/delete",
  verifyStocksUser,
  stocksUserController.deleteUserController
);

export default stocksUserRouter;
