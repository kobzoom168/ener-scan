const MAX_RECENT_PER_USER = 20;
const recentOutputsByUser = new Map();

export function getRecentOutputs(userId) {
  return recentOutputsByUser.get(userId) || [];
}

export function addRecentOutput(userId, text) {
  const current = recentOutputsByUser.get(userId) || [];
  current.unshift(text);

  if (current.length > MAX_RECENT_PER_USER) {
    current.length = MAX_RECENT_PER_USER;
  }

  recentOutputsByUser.set(userId, current);
}