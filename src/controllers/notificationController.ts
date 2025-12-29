import { Response } from "express";
import {
  createNotification,
  deleteNotification,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../services/notificationService";
import {
  sendBadRequest,
  sendSuccess,
  sendServerError,
} from "../utils/response";

/**
 * GET /notifications
 */
export const getUserNotificationsController = async (
  req: any,
  res: Response
) => {
  const userId = req.user.userId;
  const { isRead, type, limit, offset } = req.query;

  try {
    const notifications = await getUserNotifications(userId, {
      isRead: isRead !== undefined ? isRead === "true" : undefined,
      type,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return sendSuccess(res, "Notifications fetched", notifications);
  } catch (error: any) {
    console.error("[NOTIFICATION_FETCH]", error);
    return sendServerError(res, error.message);
  }
};

/**
 * PATCH /notifications/:id/read
 */
export const markNotificationReadController = async (
  req: any,
  res: Response
) => {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    await markNotificationAsRead(id, userId);
    return sendSuccess(res, "Notification marked as read");
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};

/**
 * PATCH /notifications/read-all
 */
export const markAllNotificationsReadController = async (
  req: any,
  res: Response
) => {
  const userId = req.user.userId;

  try {
    await markAllNotificationsAsRead(userId);
    return sendSuccess(res, "All notifications marked as read");
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};

/**
 * DELETE /notifications/:id
 */
export const deleteNotificationController = async (
  req: any,
  res: Response
) => {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    await deleteNotification(id, userId);
    return sendSuccess(res, "Notification deleted");
  } catch (error: any) {
    return sendServerError(res, error.message);
  }
};
