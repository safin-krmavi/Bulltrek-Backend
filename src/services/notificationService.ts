import prisma from "../config/db.config";
import { NotificationSeverity, NotificationType } from "@prisma/client";

/**
 * Create notification (used by system, strategies, workers, etc.)
 */
export const createNotification = async (data: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  meta?: Record<string, any>;
}) => {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      severity: data.severity ?? "INFO",
      meta: data.meta,
    },
  });
};

/**
 * Get notifications for a user
 */
export const getUserNotifications = async (
  userId: string,
  filters?: {
    isRead?: boolean;
    type?: NotificationType;
    limit?: number;
    offset?: number;
  }
) => {
  return prisma.notification.findMany({
    where: {
      userId,
      isRead: filters?.isRead,
      type: filters?.type,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: filters?.limit ?? 50,
    skip: filters?.offset ?? 0,
  });
};

/**
 * Mark single notification as read
 */
export const markNotificationAsRead = async (
  notificationId: string,
  userId: string
) => {
  return prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

/**
 * Delete notification (optional)
 */
export const deleteNotification = async (
  notificationId: string,
  userId: string
) => {
  return prisma.notification.deleteMany({
    where: {
      id: notificationId,
      userId,
    },
  });
};
