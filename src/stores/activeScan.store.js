const latestScanJobMap = new Map();

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

export function startScanJob(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;

  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  latestScanJobMap.set(normalizedUserId, jobId);
  return jobId;
}

export function isLatestScanJob(userId, jobId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId || !jobId) return false;

  return latestScanJobMap.get(normalizedUserId) === jobId;
}

export function clearLatestScanJob(userId, jobId = null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  if (!jobId) {
    latestScanJobMap.delete(normalizedUserId);
    return;
  }

  if (latestScanJobMap.get(normalizedUserId) === jobId) {
    latestScanJobMap.delete(normalizedUserId);
  }
}