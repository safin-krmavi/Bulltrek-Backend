import express from "express";
import * as kycController from "../../controllers/stocks/kycController";
import { verifyStocksUser } from "../../middleware/stocks/authMiddleware";
import { kycUpload } from "../../middleware/uploadMiddleware";
import { verifyStocksAdmin } from "../../middleware/stocks/isAdminMiddleware";

const router = express.Router();

// User: Submit KYC
router.post(
  "/submit",
  verifyStocksUser,
  kycUpload.single("document"),
  kycController.submitKYCController
);

// User: View own KYC history
router.get("/my", verifyStocksUser, kycController.getMyKYCsController);

// Admin routes
router.get("/all", verifyStocksAdmin, kycController.listKYCsController);
router.put(
  "/approve/:id",
  verifyStocksAdmin,
  kycController.approveKYCController
);
router.put("/reject/:id", verifyStocksAdmin, kycController.rejectKYCController);

export default router;
