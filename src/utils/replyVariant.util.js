/**
 * Non-repetitive LINE replies: pick a random variant without immediate repeat
 * for the same user + message type.
 */
export const replyVariantMemory = new Map();

/**
 * @param {string} userId
 * @param {string} type stable key, e.g. "waiting_birthdate_guidance"
 * @param {string[] | string[][]} variants — plain lines, or each entry = multi-message sequence
 * @returns {string | string[]}
 */
export function pickVariant(userId, type, variants) {
  const list = Array.isArray(variants) ? variants.filter(Boolean) : [];
  if (list.length === 0) return "";
  const first = list[0];
  const isSequenceMode = Array.isArray(first);

  if (isSequenceMode) {
    if (list.length === 1) return list[0];
    const key = `${String(userId || "")}:${String(type || "")}`;
    const lastIndex = replyVariantMemory.get(key);

    let nextIndex;
    let guard = 0;
    do {
      nextIndex = Math.floor(Math.random() * list.length);
      guard += 1;
    } while (list.length > 1 && nextIndex === lastIndex && guard < 12);

    replyVariantMemory.set(key, nextIndex);
    return list[nextIndex];
  }

  if (list.length === 1) return list[0];

  const key = `${String(userId || "")}:${String(type || "")}`;
  const lastIndex = replyVariantMemory.get(key);

  let nextIndex;
  let guard = 0;
  do {
    nextIndex = Math.floor(Math.random() * list.length);
    guard += 1;
  } while (list.length > 1 && nextIndex === lastIndex && guard < 12);

  replyVariantMemory.set(key, nextIndex);
  return list[nextIndex];
}
