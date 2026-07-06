const IMAGE_FETCH_TIMEOUT_MS = (() => {
  const n = Number(process.env.LINE_IMAGE_FETCH_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 5000 ? n : 25000;
})();

/**
 * Download a LINE message image with a hard timeout — a hung LINE content
 * stream used to stall the whole flow silently (~29s observed). On timeout the
 * caller's error path replies "ลองส่งใหม่" instead of leaving the customer waiting.
 */
export async function getImageBufferFromLineMessage(client, messageId) {
  console.log("[IMAGE] getMessageContent start:", messageId);
  const startedAt = Date.now();

  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("line_image_fetch_timeout")),
      IMAGE_FETCH_TIMEOUT_MS,
    );
  });

  const download = (async () => {
    const stream = await client.getMessageContent(messageId);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  })();

  try {
    const buffer = await Promise.race([download, timeoutPromise]);
    console.log("[IMAGE] getMessageContent success:", {
      messageId,
      size: buffer.length,
      elapsedMs: Date.now() - startedAt,
    });
    return buffer;
  } catch (error) {
    console.error("[IMAGE] getMessageContent failed:", {
      messageId,
      elapsedMs: Date.now() - startedAt,
      timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
      message: error?.message,
      statusCode: error?.statusCode,
      statusMessage: error?.statusMessage,
      originalError: error?.originalError,
      responseData: error?.response?.data,
    });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
