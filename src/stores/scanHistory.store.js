const userScanHistory = new Map();

const MAX_HISTORY = 20;

function createHistoryItem(input) {
  if (typeof input === "string") {
    return {
      time: Date.now(),
      result: input,
      energyScore: "-",
      mainEnergy: "-",
      compatibility: "-",
    };
  }

  return {
    time: input?.time || Date.now(),
    result: input?.result || "",
    energyScore: input?.energyScore || "-",
    mainEnergy: input?.mainEnergy || "-",
    compatibility: input?.compatibility || "-",
  };
}

export function addScanHistory(userId, input) {
  if (!userId) return;

  if (!userScanHistory.has(userId)) {
    userScanHistory.set(userId, []);
  }

  const history = userScanHistory.get(userId);
  const item = createHistoryItem(input);

  history.unshift(item);

  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }

  userScanHistory.set(userId, history);
}

export function getScanHistory(userId) {
  if (!userId) return [];
  return userScanHistory.get(userId) || [];
}

export function getLatestScanHistory(userId) {
  const history = getScanHistory(userId);
  return history.length > 0 ? history[0] : null;
}

export function getScanHistoryCount(userId) {
  return getScanHistory(userId).length;
}

export function getUserScanCountLast24h(userId) {
  const history = getScanHistory(userId);
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;

  let count = 0;
  for (const item of history) {
    if (typeof item?.time === "number" && item.time >= sinceMs) {
      count += 1;
    }
  }

  return count;
}

export function clearScanHistory(userId) {
  if (!userId) return;
  userScanHistory.delete(userId);
}

export function clearAllScanHistory() {
  userScanHistory.clear();
}