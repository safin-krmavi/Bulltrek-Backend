import prisma from "../../config/db.config";

export function assignFeature(roleId: string, featureId: string) {
  return prisma.roleFeature.create({
    data: { roleId, featureId },
  });
}

export function removeFeature(roleId: string, featureId: string) {
  return prisma.roleFeature.delete({
    where: { roleId_featureId: { roleId, featureId } },
  });
}

export function getRoleFeatures(roleId: string) {
  return prisma.role.findUnique({
    where: { id: roleId },
    include: {
      features: {
        include: {
          feature: true,
        },
      },
    },
  });
}
