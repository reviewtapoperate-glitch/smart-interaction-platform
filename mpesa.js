import axios from "axios";
import { env } from "../config/env.js";
import { PaymentProviderAdapter } from "./provider.js";

function timestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function baseUrl() {
  return env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

export class MpesaAdapter extends PaymentProviderAdapter {
  constructor() {
    super("MPESA");
  }

  configured() {
    return Boolean(
      env.MPESA_CONSUMER_KEY &&
      env.MPESA_CONSUMER_SECRET &&
      env.MPESA_SHORT_CODE &&
      env.MPESA_PASSKEY &&
      env.MPESA_CALLBACK_URL
    );
  }

  async accessToken() {
    const credentials = Buffer
      .from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`)
      .toString("base64");

    const response = await axios.get(
      `${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${credentials}` },
        timeout: 15000
      }
    );

    return response.data.access_token;
  }

  async initiate({ amountMinor, phone, accountReference, description }) {
    if (!this.configured()) {
      throw new Error("M-Pesa credentials are not configured");
    }

    const amount = Math.max(1, Math.round(amountMinor / 100));
    const ts = timestamp();
    const password = Buffer
      .from(`${env.MPESA_SHORT_CODE}${env.MPESA_PASSKEY}${ts}`)
      .toString("base64");

    const token = await this.accessToken();

    const response = await axios.post(
      `${baseUrl()}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: env.MPESA_SHORT_CODE,
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: env.MPESA_SHORT_CODE,
        PhoneNumber: phone,
        CallBackURL: env.MPESA_CALLBACK_URL,
        AccountReference: accountReference.slice(0, 12),
        TransactionDesc: description.slice(0, 13)
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    return {
      providerReference: response.data.CheckoutRequestID,
      raw: response.data
    };
  }
}

export const mpesa = new MpesaAdapter();
