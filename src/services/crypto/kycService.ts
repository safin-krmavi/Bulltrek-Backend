import prisma from "../../config/db.config";

export async function submitKYC(userId: string, documentUrl: string) {
  const existing = await prisma.cryptoKYC.findFirst({
    where: { userId, status: "PENDING" },
  });

  if (existing) throw new Error("You already have a pending KYC request");

  return prisma.cryptoKYC.create({
    data: {
      userId,
      document: documentUrl, // S3 URL stored
      status: "PENDING",
    },
  });
}

export async function getKYCs() {
  return prisma.cryptoKYC.findMany({
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
  return prisma.cryptoKYC.update({
    where: { id },
    data: {
      status,
      adminNote: adminNote || undefined,
      rejectionReason: rejectionReason || undefined,
    },
  });
}

export async function getUserKYCs(userId: string) {
  return prisma.cryptoKYC.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
