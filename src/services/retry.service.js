export async function generateWithRetry({
  generateFn,
  isBadOutputFn,
  buildRetryHintFn,
  maxRetries = 2,
}) {
  let lastOutput = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const retryHint = attempt === 0 ? "" : buildRetryHintFn(lastOutput, attempt);
    const output = await generateFn({ attempt, retryHint });

    lastOutput = output;

    if (!isBadOutputFn(output)) {
      return output;
    }
  }

  return lastOutput;
}