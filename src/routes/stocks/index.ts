import express from "express";
import stocksUserRouter from "./userRoutes";
import stocksCredentialsRouter from "./credentialsRoutes";
import stocksKYCRouter from "./kycRoutes";
import stocksExchangeRouter from "./exchangeRoutes";

const stocksRouter = express.Router();
stocksRouter.use(express.json());

stocksRouter.use("/user", stocksUserRouter);
stocksRouter.use("/credentials/", stocksCredentialsRouter);
stocksRouter.use("/kyc/", stocksKYCRouter);
stocksRouter.use("/exchange/", stocksExchangeRouter);

export default stocksRouter;
