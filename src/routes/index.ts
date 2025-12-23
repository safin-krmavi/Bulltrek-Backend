import express from "express";
import cryptoRouter from "./crypto/index";
import stockRouter from "./stocks/index";
import roleRouter from "./rbac/rbacRoutes";
import strategyRouter from "./strategyRoutes";
const rootrouter = express.Router();

rootrouter.use(express.json());
rootrouter.get("/", (req, res) => {
  res.send("This is main route");
});

rootrouter.use("/crypto/", cryptoRouter);
rootrouter.use("/stocks/", stockRouter);
rootrouter.use("/rbac/", roleRouter);
rootrouter.use("/strategy/", strategyRouter);

export default rootrouter;
