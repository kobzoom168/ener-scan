/**
 * ระบุประเภทพิมพ์ (broad amulet type) — vision picks from a CONTROLLED taxonomy
 * only; never invents วัด/รุ่น/ปี/ราคา. Confidence-gated: below threshold the
 * report keeps the generic "พระ / เครื่องราง" headline. Runs in parallel with the
 * deep scan (adds no latency) on sacred_amulet full scans.
 */
import { openai } from "../services/openaiDeepScan.api.js";
import { env } from "../config/env.js";

/** key → Thai display label (controlled list — model may ONLY answer these keys). */
export const AMULET_TYPE_TAXONOMY = {
  somdej: "พระสมเด็จ",
  phra_kring: "พระกริ่ง",
  rian_kejii: "เหรียญพระเกจิ",
  rian_phra: "เหรียญพระพุทธ",
  locket: "ล็อกเก็ต",
  pidta: "พระปิดตา",
  nang_phaya: "พระนางพญา",
  khun_phaen: "พระขุนแผน",
  phra_rod: "พระรอด",
  soom_kor: "พระซุ้มกอ",
  leela: "พระปางลีลา",
  nak_prok: "พระนาคปรก",
  lp_thuat: "หลวงปู่ทวด",
  sivali: "พระสีวลี",
  takrut: "ตะกรุด",
  rahu: "ราหูอมจันทร์",
  bia_kae: "เบี้ยแก้",
  phayant: "ผ้ายันต์",
  phra_phong: "พระเนื้อผง",
  phra_loha: "พระเนื้อโลหะ",
  krueang_rang: "เครื่องราง",
  unknown: "",
};

const TYPE_KEYS = Object.keys(AMULET_TYPE_TAXONOMY);

const CLASSIFY_PROMPT = `You classify a Thai sacred amulet photo into ONE broad type from this fixed list (answer with the key only):
${TYPE_KEYS.map((k) => `- ${k}${AMULET_TYPE_TAXONOMY[k] ? ` = ${AMULET_TYPE_TAXONOMY[k]}` : " = cannot tell / not in list"}`).join("\n")}

Rules:
- Judge ONLY the broad form/พิมพ์ทรง (shape, posture, material class). DO NOT guess temple, batch, year, maker, or authenticity.
- somdej = rectangular powder amulet with tiered base + seated Buddha in arch. phra_kring = small cast metal seated Buddha statuette. rian_* = STAMPED/STRUCK METAL medal with relief (ผิวโลหะนูนต่ำจากการปั๊ม — kejii = monk portrait in relief, phra = Buddha image in relief). locket = PHOTOGRAPHIC PRINT of a monk (or printed/painted image) mounted in a frame/casing — flat photo surface, often glass/acrylic cover, may have takrut/powder embedded on the back. pidta = eyes-covered posture. nang_phaya = triangular seated. khun_phaen = arch/leaf shaped with Buddha. phra_rod = tiny oval ancient style. leela = walking Buddha. nak_prok = Buddha under naga hood. lp_thuat = LP Thuat figure. takrut = rolled metal tube. rahu = eclipse deity biting moon (often coconut shell). bia_kae = cowrie shell charm. phra_phong/phra_loha = powder/metal amulet not matching a specific type above. krueang_rang = other charm objects (มีดหมอ ปลัดขิก สิงห์ etc.).
- CRITICAL: a monk PHOTO (photographic/printed image, flat) = locket, NEVER rian_kejii. rian_* requires actual stamped metal relief. If unsure between locket and rian → locket when the surface looks like a photo/print, rian only when clearly embossed metal.
- If image is a bare BACK side or too unclear to type → unknown.
- Reply STRICT JSON one line: {"type": "<key>", "confidence": <0.0-1.0>}`;

/**
 * @param {{ imageBase64: string, mimeType?: string }} p
 * @returns {Promise<{ typeKey: string, labelThai: string, confidence: number } | null>}
 *          null when disabled/failed/below-threshold/unknown.
 */
export async function classifyAmuletType(p) {
  if (!env.AMULET_TYPE_CLASSIFY_ENABLED) return null;
  const b64 = String(p?.imageBase64 || "").trim().replace(/^data:[^;]+;base64,/i, "");
  if (!b64) return null;
  const mime = String(p?.mimeType || "image/jpeg");

  try {
    const resp = await Promise.race([
      openai.responses.create({
        model: env.AMULET_TYPE_CLASSIFY_MODEL,
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: CLASSIFY_PROMPT },
              { type: "input_image", image_url: `data:${mime};base64,${b64}` },
            ],
          },
        ],
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("amulet_type_timeout")), 12000)),
    ]);
    const raw = typeof resp?.output_text === "string" ? resp.output_text : "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    const typeKey = String(j?.type || "").trim();
    const confidence = Number(j?.confidence);
    if (!TYPE_KEYS.includes(typeKey) || typeKey === "unknown") return null;
    if (!Number.isFinite(confidence) || confidence < env.AMULET_TYPE_MIN_CONFIDENCE) return null;
    const labelThai = AMULET_TYPE_TAXONOMY[typeKey];
    if (!labelThai) return null;
    return { typeKey, labelThai, confidence };
  } catch {
    return null;
  }
}
