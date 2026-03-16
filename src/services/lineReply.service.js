export async function replyText(client, replyToken, text) {
  console.log("replyText called");
  console.log("replyToken exists:", Boolean(replyToken));
  console.log("reply text length:", text?.length || 0);

  const safeText = String(text || "").slice(0, 4900);

  const result = await client.replyMessage(replyToken, {
    type: "text",
    text: safeText,
  });

  console.log("replyText success");
  return result;
}

export async function replyFlex(client, replyToken, flexMessage) {
  console.log("replyFlex called");
  console.log("replyToken exists:", Boolean(replyToken));

  const result = await client.replyMessage(replyToken, flexMessage);

  console.log("replyFlex success");
  return result;
}