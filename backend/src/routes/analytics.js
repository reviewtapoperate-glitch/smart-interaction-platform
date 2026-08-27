import express from "express";
import { prisma } from "../config/prisma.js";
import { authRequired } from "../utils/auth.js";
import { asyncRoute } from "../utils/http.js";

const router = express.Router();
router.use(authRequired);

router.get("/summary", asyncRoute(async (req, res) => {
  const businessId = req.auth.businessId;

  const [endpoints, sessions, orders, payments, events] = await Promise.all([
    prisma.endpoint.count({ where: { businessId, status: "ACTIVE" } }),
    prisma.session.count({ where: { businessId } }),
    prisma.order.count({ where: { businessId } }),
    prisma.payment.count({ where: { businessId, status: "SUCCESS" } }),
    prisma.analyticsEvent.count({ where: { businessId } })
  ]);

  const successful = await prisma.payment.aggregate({
    where: { businessId, status: "SUCCESS" },
    _sum: { amountMinor: true }
  });

  res.json({
    endpoints,
    sessions,
    orders,
    successfulPayments: payments,
    interactionEvents: events,
    paidAmountMinor: successful._sum.amountMinor || 0
  });
}));

export default router;
