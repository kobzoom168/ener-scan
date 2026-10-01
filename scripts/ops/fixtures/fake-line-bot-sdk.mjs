// @line/bot-sdk ปลอมสำหรับ integration test: middleware/validateSignature = ของจริง (ตรวจลายเซ็นจริง) · Client = บันทึกการเรียก ไม่ยิง LINE
import { createRequire } from "node:module";
import { Readable } from "node:stream";
const real = createRequire(import.meta.url)("@line/bot-sdk");
const g = globalThis;
g.__lineIt = g.__lineIt || { calls: [], images: new Map() };
class Client {
  constructor(config) { this.config = config; }
  async replyMessage(replyToken, messages) { g.__lineIt.calls.push({ type: "reply", replyToken, messages: [].concat(messages) }); return {}; }
  async pushMessage(to, messages) { g.__lineIt.calls.push({ type: "push", to, messages: [].concat(messages) }); return {}; }
  async getMessageContent(messageId) {
    g.__lineIt.calls.push({ type: "getMessageContent", messageId });
    const buf = g.__lineIt.images.get(String(messageId));
    if (!buf) { const e = new Error("no such image in fake LINE"); e.statusCode = 404; throw e; }
    return Readable.from([buf]);
  }
  async getBotInfo() { return { displayName: "it-bot", userId: "Ubot" }; }
  async getProfile() { return { displayName: "it-user" }; }
}
const mod = { ...real, Client, middleware: real.middleware, validateSignature: real.validateSignature,
  SignatureValidationFailed: real.SignatureValidationFailed, HTTPError: real.HTTPError };
export const { middleware, validateSignature, SignatureValidationFailed, HTTPError, JSONParseError, ReadError, RequestError } = real;
export { Client };
export default mod;
