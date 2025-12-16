import express from "express";
import * as kycController from "../../controllers/stocks/kycController";
import { verifyStocksUser } from "../../middleware/stocks/authMiddleware";
import { verifyStocksAdmin } from "../../middleware/stocks/isAdminMiddleware";
import { s3KycUpload } from "../../middleware/s3UploadMiddleware";

const router = express.Router();

router.post(
  "/submit",
  verifyStocksUser,
  s3KycUpload.single("document"),
  kycController.submitKYCController
);

router.get("/my", verifyStocksUser, kycController.getMyKYCsController);

router.get("/all", verifyStocksAdmin, kycController.listKYCsController);
router.put(
  "/approve/:id",
  verifyStocksAdmin,
  kycController.approveKYCController
);
router.put("/reject/:id", verifyStocksAdmin, kycController.rejectKYCController);

export default router;
