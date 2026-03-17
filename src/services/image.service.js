export async function getImageBufferFromLineMessage(client, messageId) {
  try {
    console.log("[IMAGE] getMessageContent start:", messageId);

    const stream = await client.getMessageContent(messageId);

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    console.log("[IMAGE] getMessageContent success:", {
      messageId,
      chunkCount: chunks.length,
      size: buffer.length,
    });

    return buffer;
  } catch (error) {
    console.error("[IMAGE] getMessageContent failed:", {
      messageId,
      message: error?.message,
      statusCode: error?.statusCode,
      statusMessage: error?.statusMessage,
      originalError: error?.originalError,
      responseData: error?.response?.data,
    });

    throw error;
  }
}