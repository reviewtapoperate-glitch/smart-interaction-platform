import { prisma } from "../config/prisma.js";

export async function audit({ businessId, userId, action, entityType, entityId, metadata }) {
  return prisma.auditLog.create({
    data: {
      businessId,
      userId,
      action,
      entityType,
      entityId,
      metadata
    }
  });
}
