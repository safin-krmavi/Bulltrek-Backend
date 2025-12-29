import { Router } from "express";
import {
  deleteNotificationController,
  getUserNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
} from "../controllers/notificationController";
import { verifyCryptoUser } from "../middleware/crypto/authMiddleware";

const router = Router();

// Get user notifications
router.get(
  "/notifications",
  verifyCryptoUser,
  getUserNotificationsController
);

// Mark single notification as read
router.patch(
  "/notifications/:id/read",
  verifyCryptoUser,
  markNotificationReadController
);

// Mark all notifications as read
router.patch(
  "/notifications/read-all",
  verifyCryptoUser,
  markAllNotificationsReadController
);

// Delete notification
router.delete(
  "/notifications/:id",
  verifyCryptoUser,
  deleteNotificationController
);

export default router;
