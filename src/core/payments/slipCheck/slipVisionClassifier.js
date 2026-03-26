/**
 * Optional vision classifier for payment slip vs chat/object/other.
 * Fail-closed: errors → unclear outcome (caller decides).
 */
import { openai } from "../../../services/openaiDeepScan.api.js";
import { env } from "../../../config/env.js";

const TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.SLIP_GATE_VISION_TIMEOUT_MS || 28000) || 28000,
);

const SYSTEM = `You are a strict image classifier for Thai payment slips (bank app / PromptPay transfer receipts).
Return ONLY valid JSON, no markdown, no extra text.

JSON schema:
{
  "slipLabel": "likely_slip" | "chat_screenshot" | "object_photo" | "other_image",
  "evidenceScore": number between 0 and 1,
  "signals": {
    "amountVisible": boolean,
    "dateTimeVisible": boolean,
    "bankOrWalletUi": boolean,
    "referenceLikeText": boolean
  }
}

Rules:
- likely_slip: clear evidence of a money transfer / payment success screen (amount, time, bank or wallet UI, ref text).
- chat_screenshot: LINE/WhatsApp/messaging bubbles, chat chrome, conversation UI dominating the image.
- object_photo: single physical object (amulet, crystal, product photo) with no bank slip UI.
- other_image: anything else (meme, unrelated, unreadable).

Be conservative: if unsure between likely_slip and other_image, use other_image with low evidenceScore.`;

/**
 * @param {string} imageBase64 raw base64 (no data: prefix)
 * @returns {Promise<{
 *   slipLabel: import('./slipCheck.types.js').SlipLabel,
 *   evidenceScore: number,
 *   signals: import('./slipCheck.types.js').SlipEvidenceSignals,
 * } | null>}
 */
export async function classifySlipWithVision(imageBase64) {
  const b64 = String(imageBase64 || "").trim();
  if (!b64) return null;

  try {
    const response = await Promise.race([
      openai.responses.create({
        model: env.SLIP_GATE_VISION_MODEL,
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: SYSTEM },
              {
                type: "input_image",
                image_url: `data:image/jpeg;base64,${b64}`,
              },
            ],
          },
        ],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("slip_vision_timeout")), TIMEOUT_MS),
      ),
    ]);

    const text = String(response?.output_text || "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const raw = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(raw);

    const slipLabel = String(parsed.slipLabel || "").trim();
    const allowed = new Set([
      "likely_slip",
      "chat_screenshot",
      "object_photo",
      "other_image",
    ]);
    if (!allowed.has(slipLabel)) return null;

    let evidenceScore = Number(parsed.evidenceScore);
    if (!Number.isFinite(evidenceScore)) evidenceScore = 0;
    evidenceScore = Math.min(1, Math.max(0, evidenceScore));

    const sig = parsed.signals && typeof parsed.signals === "object"
      ? parsed.signals
      : {};
    const signals = {
      amountVisible: Boolean(sig.amountVisible),
      dateTimeVisible: Boolean(sig.dateTimeVisible),
      bankOrWalletUi: Boolean(sig.bankOrWalletUi),
      referenceLikeText: Boolean(sig.referenceLikeText),
    };

    return { slipLabel, evidenceScore, signals };
  } catch {
    return null;
  }
}

/** @returns {boolean} */
export function isSlipVisionEnabled() {
  return Boolean(env.SLIP_GATE_VISION_ENABLED);
}
