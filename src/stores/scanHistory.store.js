const userScanHistory = new Map();

const MAX_HISTORY = 20;

export function addScanHistory(userId, resultText) {

  if (!userScanHistory.has(userId)) {
    userScanHistory.set(userId, []);
  }

  const history = userScanHistory.get(userId);

  history.unshift({
    time: Date.now(),
    result: resultText
  });

  if (history.length > MAX_HISTORY) {
    history.pop();
  }

  userScanHistory.set(userId, history);
}

export function getScanHistory(userId) {

  if (!userScanHistory.has(userId)) {
    return [];
  }

  return userScanHistory.get(userId);
}