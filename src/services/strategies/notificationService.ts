import { NotificationType, NotificationSeverity } from "@prisma/client";
import prisma from "../../config/db.config";

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  meta?: Record<string, any>;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      severity: params.severity ?? "INFO",
      meta: params.meta,
    },
  });
}
