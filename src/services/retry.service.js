export async function generateWithRetry({
  generateFn,
  isBadOutputFn,
  buildRetryHintFn,
  maxRetries = 2,
}) {
  let lastOutput = "";
  let lastReason = "unknown";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const retryHint =
      attempt === 0 ? "" : buildRetryHintFn(lastOutput, attempt, lastReason);

    const output = await generateFn({ attempt, retryHint });
    lastOutput = output;

    const result = isBadOutputFn(output);

    console.log(`attempt #${attempt} validation:`, result);

    if (!result.isBad) {
      console.log(`attempt #${attempt} accepted`);
      return {
        output,
        attempt,
        accepted: true,
        reason: "ok",
      };
    }

    lastReason = result.reason || "bad_output";
  }

  console.log("all attempts used, returning last output");
  return {
    output: lastOutput,
    attempt: maxRetries,
    accepted: false,
    reason: lastReason,
  };
}