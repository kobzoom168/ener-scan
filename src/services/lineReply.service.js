export async function replyText(client, replyToken, text) {
  console.log("[LINE_REPLY_TEXT] start");
  console.log("[LINE_REPLY_TEXT] replyToken exists:", Boolean(replyToken));
  console.log("[LINE_REPLY_TEXT] text length:", text?.length || 0);

  const safeText = String(text || "").slice(0, 4900);

  try {
    const result = await client.replyMessage(replyToken, {
      type: "text",
      text: safeText,
    });

    console.log("[LINE_REPLY_TEXT] success");
    return result;
  } catch (error) {
    console.error("[LINE_REPLY_TEXT] failed:", error?.message || error);
    throw error;
  }
}

export async function replyFlex(client, replyToken, flexMessage) {
  console.log("[LINE_REPLY_FLEX] start");
  console.log("[LINE_REPLY_FLEX] replyToken exists:", Boolean(replyToken));
  console.log("[LINE_REPLY_FLEX] altText:", flexMessage?.altText || "no-altText");

  try {
    const result = await client.replyMessage(replyToken, flexMessage);

    console.log("[LINE_REPLY_FLEX] success");
    return result;
  } catch (error) {
    console.error("[LINE_REPLY_FLEX] failed:", error?.message || error);
    throw error;
  }
}