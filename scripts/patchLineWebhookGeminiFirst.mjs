/**
 * Inserts `if (await tryGeminiBeforeTextReply()) return;` before outbound
 * text sends in handleTextMessage only (after orchestrator definition).
 * Skips: lines already guarded; sendNonScanPaymentQrInstructions; sendScanLockReply.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, "../src/routes/lineWebhook.js");
const lines = fs.readFileSync(filePath, "utf8").split(/\n/);

const SEND_RE =
  /^\s*await sendNonScan(Reply|SequenceReply|ReplyWithOptionalConvSurface)\(/;
const REPLY_IDLE_RE = /^\s*await replyIdleTextNoDuplicate\(/;
const TRY_LINE = "    if (await tryGeminiBeforeTextReply()) return;";

const handleTextIdx = lines.findIndex((l) =>
  l.includes("async function handleTextMessage("),
);
const handleEventIdx = lines.findIndex((l) =>
  l.includes("async function handleEvent("),
);
if (handleTextIdx < 0 || handleEventIdx < 0) {
  console.error("Could not find handleTextMessage or handleEvent");
  process.exit(1);
}

let orchestratorEnd = -1;
for (let i = handleTextIdx; i < handleEventIdx; i++) {
  if (
    lines[i].trim() === "};" &&
    lines[i].startsWith("  ") &&
    lines[i + 1]?.includes('if (paymentState === "paywall_offer_single")')
  ) {
    orchestratorEnd = i;
    break;
  }
}
if (orchestratorEnd < 0) {
  console.error("Could not find orchestrator end");
  process.exit(1);
}

function alreadyGuarded(i) {
  for (let k = Math.max(0, i - 4); k < i; k++) {
    const t = lines[k].trim();
    if (
      t === "if (await tryGeminiBeforeTextReply()) return;" ||
      t.startsWith("if (await tryGeminiBeforeTextReply()) return;")
    ) {
      return true;
    }
    if (/invokePhase1GeminiOrchestrator\(\)/.test(lines[k])) return true;
  }
  return false;
}

const out = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const inHandleBlock = i > orchestratorEnd && i < handleEventIdx;
  const isSend =
    (SEND_RE.test(line) || REPLY_IDLE_RE.test(line)) &&
    !line.includes("sendNonScanPaymentQrInstructions");

  if (inHandleBlock && isSend && !alreadyGuarded(i)) {
    out.push(TRY_LINE);
  }
  out.push(line);
}

fs.writeFileSync(filePath, out.join("\n"));
console.log(
  "Patched",
  filePath,
  "orchestratorEnd line",
  orchestratorEnd + 1,
);
