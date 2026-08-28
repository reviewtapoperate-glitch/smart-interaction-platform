import { prisma } from "../config/prisma.js";

export async function recordEvent({ businessId, endpointId, sessionId, eventName, metadata }) {
  return prisma.analyticsEvent.create({
    data: {
      businessId,
      endpointId,
      sessionId,
      eventName,
      metadata
    }
  });
}
