import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "/app/src/integrations/gemini/geminiFlash.api.js";

console.log("CONFIGURED", isGeminiConfigured());
const model = getGeminiFlashModel({
  systemInstruction: "คุณคืออาจารย์ Ener ตอบเป็นภาษาไทยสั้นๆ เป็นกันเอง ลงท้ายครับ",
  temperature: 0.85,
});
const t0 = Date.now();
const out = await generateTextWithTimeout(model, "สวัสดีครับ วันนี้ดูพระให้หน่อย", 15000);
console.log("MS", Date.now() - t0);
console.log("OUT >>>", out);
