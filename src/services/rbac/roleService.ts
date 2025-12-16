import { Website } from "@prisma/client";
import prisma from "../../config/db.config";

export function createRole(name: string, website: Website) {
  return prisma.role.create({ data: { name, website } });
}

export function getRoles(website?: Website) {
  return prisma.role.findMany({
    where: website ? { website } : {},
  });
}

export function getRole(id: string) {
  return prisma.role.findUnique({ where: { id } });
}

export function updateRole(id: string, data: any) {
  return prisma.role.update({ where: { id }, data });
}

export function deleteRole(id: string) {
  return prisma.role.delete({ where: { id } });
}
