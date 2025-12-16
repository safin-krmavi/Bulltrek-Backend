import prisma from "../../config/db.config";

export async function submitKYC(userId: string, documentUrl: string) {
  const pending = await prisma.stocksKYC.findFirst({
    where: { userId, status: "PENDING" },
  });

  if (pending) throw new Error("You already have a pending KYC request");

  return prisma.stocksKYC.create({
    data: {
      userId,
      document: documentUrl,
      status: "PENDING",
    },
  });
}

export async function getKYCs() {
  return prisma.stocksKYC.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateKYCStatus(
  id: string,
  status: "APPROVED" | "REJECTED",
  adminNote?: string,
  rejectionReason?: string
) {
  return prisma.stocksKYC.update({
    where: { id },
    data: {
      status,
      adminNote: adminNote || undefined,
      rejectionReason: rejectionReason || undefined,
    },
  });
}

export async function getUserKYCs(userId: string) {
  return prisma.stocksKYC.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
