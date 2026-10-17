import { LogSeverity } from "@shopify/shopify-app-remix/server";

// Shopify's debug messages include raw JWTs and their payloads. Never forward
// debug output: translate only the validation failure into a fixed reason code.
export const shopifyLogger = {
  level: LogSeverity.Debug,
  log(severity: LogSeverity, message: string) {
    if (severity !== LogSeverity.Debug) {
      console.log(message);
      return;
    }

    if (!message.startsWith("[shopify-app/DEBUG] Failed to validate session token:")) return;

    let reason = "invalid_session_token";
    if (message.includes("Session token had invalid API key")) {
      reason = "client_id_mismatch";
    } else if (message.includes("signature verification failed")) {
      reason = "signature_mismatch";
    } else if (message.includes('"exp" claim timestamp check failed')) {
      reason = "token_expired";
    } else if (message.includes('"nbf" claim timestamp check failed')) {
      reason = "token_not_yet_valid";
    }

    console.warn(`[PicoSEO/auth] session_token_rejected reason=${reason}`);
  },
};
