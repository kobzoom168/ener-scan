/**
 * Thai keyword retrieval over kb_entries — no embeddings: Thai has no spaces,
 * so we score by substring hits of each pattern/tag phrase inside the user
 * text (and vice-versa for long questions). Top matches are injected into the
 * consult prompt; FAQ entries outrank knowledge on ties.
 */
import { listActiveKbEntries } from "../../../stores/kb.db.js";

/** Split "a, b, c" / newline lists into clean phrases. */
function phrases(raw) {
  return String(raw || "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function scoreEntry(userText, entry) {
  let score = 0;
  for (const p of phrases(entry.question_patterns)) {
    if (userText.includes(p)) score += Math.min(6, 2 + Math.floor(p.length / 4));
  }
  for (const t of phrases(entry.tags)) {
    if (userText.includes(t)) score += 1;
  }
  if (entry.entry_type === "faq" && score > 0) score += 1;
  return score;
}

/**
 * @param {string} userText
 * @param {number} [limit]
 * @returns {Promise<string|null>} prompt block, or null when nothing matches
 */
export async function buildKbContext(userText, limit = 3) {
  const text = String(userText || "").trim();
  if (text.length < 2) return null;
  const rows = await listActiveKbEntries();
  if (!rows.length) return null;

  const ranked = rows
    .map((e) => ({ e, score: scoreEntry(text, e) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));

  if (!ranked.length) return null;

  const blocks = ranked.map(({ e }) => {
    const kind = e.entry_type === "faq" ? "สคริปต์ (ยึดเนื้อหานี้ ปรับคำได้เล็กน้อยให้เป็นเสียงอาจารย์)" : "ความรู้ (เรียบเรียงเป็นเสียงอาจารย์ได้)";
    return `[${kind}] ${e.title}\n${e.answer}`;
  });
  return blocks.join("\n\n");
}
