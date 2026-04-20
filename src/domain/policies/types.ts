export type PolicyStatus = "active" | "paid_out" | "expired" | "cancelled";

export interface PolicyRequest {
  flightNumber: string;
  date: string;
  payoutAddress: string;
}

export interface Policy {
  id: string;
  flightNumber: string;
  date: string;
  payoutAddress: string;
  premium: string;
  payoutAmount: string;
  status: PolicyStatus;
  scheduledDeparture: string;
  createdAt: number;
  updatedAt: number;
  payoutTxHash?: string;
  lastCheckedAt?: number;
  lastFlightStatus?: string;
}

export interface CheckResult {
  policyId: string;
  flightNumber: string;
  flightStatus: string;
  delayMinutes: number;
  actionTaken: "payout" | "expired" | "none";
  payoutTxHash?: string;
}

export interface PolicyEvaluation {
  actionTaken: "payout" | "expired" | "none";
  delayMinutes: number;
  flightStatus: string;
  reason: string;
}
