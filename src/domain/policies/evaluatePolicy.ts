import type { AppConfig } from "../../config/types.js";
import {
  getDepartureDelayMinutes,
  hasFlightDeparted,
  isFlightTerminal,
  type FlightInfo,
} from "../../integrations/aerodatabox.js";
import type { PolicyEvaluation } from "./types.js";

export function evaluatePolicy(
  flightInfo: FlightInfo,
  config: AppConfig,
): PolicyEvaluation {
  const flightStatus = flightInfo.status;
  const delayMinutes = getDepartureDelayMinutes(flightInfo);
  const departed = hasFlightDeparted(flightInfo);
  const terminal = isFlightTerminal(flightInfo);

  if (flightStatus === "Cancelled") {
    return {
      actionTaken: "expired",
      delayMinutes,
      flightStatus,
      reason: "flight cancelled",
    };
  }

  if (departed && delayMinutes >= config.delayThresholdMin) {
    return {
      actionTaken: "payout",
      delayMinutes,
      flightStatus,
      reason: "delay meets or exceeds threshold",
    };
  }

  if (terminal && delayMinutes < config.delayThresholdMin) {
    return {
      actionTaken: "expired",
      delayMinutes,
      flightStatus,
      reason: "terminal flight below threshold",
    };
  }

  return {
    actionTaken: "none",
    delayMinutes,
    flightStatus,
    reason: "flight still in progress",
  };
}
