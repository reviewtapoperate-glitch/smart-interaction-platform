export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function assertBusiness(req, businessId) {
  if (req.auth?.businessId !== businessId) {
    const error = new Error("Business access denied");
    error.status = 403;
    throw error;
  }
}
