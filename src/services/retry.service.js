export async function generateWithRetry({
  generateFn,
  isBadOutputFn,
  buildRetryHintFn,
  maxRetries = 2,
}) {
  if (typeof generateFn !== "function") {
    throw new Error("generateFn is required");
  }

  if (typeof isBadOutputFn !== "function") {
    throw new Error("isBadOutputFn is required");
  }

  const safeBuildRetryHint =
    typeof buildRetryHintFn === "function"
      ? buildRetryHintFn
      : () => "";

  let lastOutput = "";
  let lastReason = "unknown";
  let lastAttempt = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    lastAttempt = attempt;

    const retryHint =
      attempt === 0 ? "" : safeBuildRetryHint(lastOutput, attempt, lastReason);

    console.log("[RETRY] ------------------------------");
    console.log("[RETRY] attempt:", attempt);
    console.log("[RETRY] retryHint:", retryHint || "none");

    const output = await generateFn({
      attempt,
      retryHint,
    });

    lastOutput = String(output || "").trim();

    console.log("[RETRY] output length:", lastOutput.length);
    console.log("[RETRY] output preview:", lastOutput.slice(0, 160) || "-");

    if (!lastOutput) {
      lastReason = "empty_output";

      console.log("[RETRY] validation:", {
        isBad: true,
        reason: lastReason,
      });

      continue;
    }

    const result = isBadOutputFn(lastOutput) || {
      isBad: false,
      reason: "ok",
    };

    console.log("[RETRY] validation:", result);

    if (!result.isBad) {
      console.log("[RETRY] accepted at attempt:", attempt);

      return {
        output: lastOutput,
        attempt,
        accepted: true,
        reason: "ok",
      };
    }

    lastReason = result.reason || "bad_output";
    console.log("[RETRY] rejected at attempt:", attempt);
    console.log("[RETRY] reject reason:", lastReason);
  }

  console.log("[RETRY] all attempts used, returning last output");
  console.log("[RETRY] final attempt:", lastAttempt);
  console.log("[RETRY] final accepted:", false);
  console.log("[RETRY] final reason:", lastReason);

  return {
    output: lastOutput,
    attempt: lastAttempt,
    accepted: false,
    reason: lastReason,
  };
}