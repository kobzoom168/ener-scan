export async function replyText(client, replyToken, text) {
  return client.replyMessage(replyToken, {
    type: "text",
    text,
  });
}