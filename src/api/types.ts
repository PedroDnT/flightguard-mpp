import type { Policy } from "../domain/policies/types.js";

export interface InsureRequest {
  flightNumber: string;
  date: string;
  payoutAddress: string;
}

export interface InsureResponse {
  policyId: string;
  flightNumber: string;
  date: string;
  scheduledDeparture: string;
  premium: string;
  payoutAmount: string;
  payoutAddress: string;
  status: Policy["status"];
  message: string;
}

export interface PolicyResponse {
  policy: Policy;
}
