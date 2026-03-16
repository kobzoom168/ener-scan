export async function generateWithRetry({
  generateFn,
  isBadOutputFn,
  buildRetryHintFn,
  maxRetries = 2,
}) {
  let lastOutput = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const retryHint =
      attempt === 0 ? "" : buildRetryHintFn(lastOutput, attempt);

    const output = await generateFn({ attempt, retryHint });
    lastOutput = output;

    const isBad = isBadOutputFn(output);
    console.log(`attempt #${attempt} isBad:`, isBad);

    if (!isBad) {
      console.log(`attempt #${attempt} accepted`);
      return output;
    }
  }

  console.log("all attempts used, returning last output");
  return lastOutput;
}