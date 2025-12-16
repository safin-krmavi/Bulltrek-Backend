import { Website } from "@prisma/client";
import prisma from "../../config/db.config";

export function createFeature(name: string, website: Website) {
  return prisma.feature.create({ data: { name, website } });
}

export function getFeatures(website?: Website) {
  return prisma.feature.findMany({
    where: website ? { website } : {},
  });
}

export function getFeature(id: string) {
  return prisma.feature.findUnique({ where: { id } });
}

export function updateFeature(id: string, data: any) {
  return prisma.feature.update({ where: { id }, data });
}

export function deleteFeature(id: string) {
  return prisma.feature.delete({ where: { id } });
}
