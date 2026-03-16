const MAX_RECENT_PER_USER = 20;
const MAX_GLOBAL_RECENT = 50;

const recentOutputsByUser = new Map();
const globalRecentOutputs = [];

export function getRecentOutputs(userId) {
  return recentOutputsByUser.get(userId) || [];
}

export function getGlobalRecentOutputs() {
  return globalRecentOutputs;
}

export function addRecentOutput(userId, text) {
  const current = recentOutputsByUser.get(userId) || [];
  current.unshift(text);

  if (current.length > MAX_RECENT_PER_USER) {
    current.length = MAX_RECENT_PER_USER;
  }

  recentOutputsByUser.set(userId, current);

  globalRecentOutputs.unshift(text);
  if (globalRecentOutputs.length > MAX_GLOBAL_RECENT) {
    globalRecentOutputs.length = MAX_GLOBAL_RECENT;
  }
}