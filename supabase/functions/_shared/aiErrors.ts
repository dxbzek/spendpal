// Turns a failed model call into the status and message the app shows.
// This file has no Deno or npm imports, so the app's unit tests can load it.

export interface AiFailure {
  status: number;
  error: string;
}

export interface AiErrorFacts {
  /** The request ran out of time before the API answered. */
  timeout?: boolean;
  /** HTTP status from the API, when there was a response. */
  status?: number;
  /** The API's error type, e.g. "invalid_request_error" or "billing_error". */
  type?: string | null;
  message?: string;
}

/**
 * A setting or key on the server is wrong. Users cannot fix that, and there is
 * no support desk to contact, so the message says only that AI is down; the
 * cause is in the function log.
 */
export const AI_UNAVAILABLE_MESSAGE = "AI is unavailable right now. Try again later.";

export const OUT_OF_CREDIT_MESSAGE = "AI is unavailable: the AI account is out of credit.";

/**
 * An empty account is reported by the API as HTTP 400 invalid_request_error
 * with "Your credit balance is too low to access the Anthropic API", or as a
 * 402 billing_error. Neither is the user's fault and a retry cannot help, so
 * the app gets a 503 that says what is wrong instead of "AI service error".
 */
export function isOutOfCredit(e: AiErrorFacts): boolean {
  return e.status === 402
    || e.type === "billing_error"
    || /credit balance is too low/i.test(e.message ?? "");
}

export function mapAiError(e: AiErrorFacts): AiFailure {
  if (e.timeout) return { status: 504, error: "AI request timed out. Please try again." };
  if (isOutOfCredit(e)) return { status: 503, error: OUT_OF_CREDIT_MESSAGE };
  if (e.status === 429) return { status: 429, error: "Rate limit exceeded. Please try again in a moment." };
  if (e.status === 401 || e.status === 403) {
    return { status: 503, error: AI_UNAVAILABLE_MESSAGE };
  }
  return { status: 500, error: "AI service error" };
}
