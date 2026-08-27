import { prisma } from "../config/prisma.js";

export async function getSessionBill(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      orders: {
        where: { status: { not: "CANCELLED" } },
        include: { items: true }
      }
    }
  });

  if (!session) throw new Error("Session not found");

  const items = [];
  for (const order of session.orders) {
    for (const item of order.items) {
      const remaining = Math.max(item.quantity - item.paidQuantity, 0);
      if (remaining <= 0) continue;
      items.push({
        id: item.id,
        orderId: order.id,
        productId: item.productId,
        name: item.nameSnapshot,
        quantity: remaining,
        unitPriceMinor: item.unitPriceMinor,
        totalMinor: item.unitPriceMinor * remaining,
        paidQuantity: item.paidQuantity
      });
    }
  }

  const totalMinor = items.reduce((sum, item) => sum + item.totalMinor, 0);

  return {
    session: {
      id: session.id,
      status: session.status,
      endpointId: session.endpointId,
      publicToken: session.publicToken
    },
    currency: items[0]?.currency || null,
    items,
    totalMinor
  };
}

export async function markSelectedItemsPaid(tx, selectedItemIds) {
  const selected = new Set(selectedItemIds);
  const items = await tx.orderItem.findMany({
    where: { id: { in: selectedItemIds } }
  });

  for (const item of items) {
    if (selected.has(item.id)) {
      await tx.orderItem.update({
        where: { id: item.id },
        data: { paidQuantity: item.quantity }
      });
    }
  }
}

export async function closeSessionIfPaid(tx, sessionId) {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    include: { orders: { include: { items: true } } }
  });

  if (!session) return null;

  const remaining = session.orders.flatMap(o => o.items).reduce(
    (sum, item) => sum + Math.max(item.quantity - item.paidQuantity, 0),
    0
  );

  if (remaining === 0 && session.status === "ACTIVE") {
    return tx.session.update({
      where: { id: sessionId },
      data: { status: "PAID", paidAt: new Date(), closedAt: new Date() }
    });
  }

  return session;
}
