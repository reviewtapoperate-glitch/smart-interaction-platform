import { mpesa } from "./mpesa.js";

export function getPaymentAdapter(provider) {
  switch (provider) {
    case "MPESA":
      return mpesa;
    default:
      throw new Error(`Payment provider ${provider} is not configured in this release`);
  }
}
