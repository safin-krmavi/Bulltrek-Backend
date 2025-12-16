import express from "express";
import cryptoUserRouter from "./userRoutes";
import cryptoCredentialsRouter from "./credentialsRoutes";
import cryptoKYCRouter from "./kycRoutes";
import cryptoExchangeRouter from "./exchangeRoutes";
import cryptoTradeRouter from "./tradeRoutes";

const cryptoRouter = express.Router();
cryptoRouter.use(express.json());

cryptoRouter.use("/user/", cryptoUserRouter);
cryptoRouter.use("/credentials/", cryptoCredentialsRouter);
cryptoRouter.use("/kyc/", cryptoKYCRouter);
cryptoRouter.use("/exchange/", cryptoExchangeRouter);
cryptoRouter.use("/trade/", cryptoTradeRouter);

export default cryptoRouter;
