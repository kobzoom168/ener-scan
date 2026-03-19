const activeImageUsers = new Set();
const lastAcceptedImageEventAtMap = new Map();
const latestScanJobMap = new Map();
const userFlowVersionMap = new Map();
const requestBlockedUsersMap = new Map();
const pendingImageCandidateMap = new Map();

const IMAGE_BURST_WINDOW_MS = 8000;
const REQUEST_BLOCK_TTL_MS = 8000;
const IMAGE_CANDIDATE_WINDOW_MS = 5000;

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

export function getEventTimestamp(event) {
  const ts = Number(event?.timestamp || 0);
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
}

export function isUserProcessingImage(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  return activeImageUsers.has(normalizedUserId);
}

export function setUserProcessingImage(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  activeImageUsers.add(normalizedUserId);
}

export function clearUserProcessingImage(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  activeImageUsers.delete(normalizedUserId);
}

export function isInImageBurstWindow(userId, eventTimestamp) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  const lastAcceptedEventAt = lastAcceptedImageEventAtMap.get(normalizedUserId);
  if (!lastAcceptedEventAt) return false;

  return eventTimestamp - lastAcceptedEventAt < IMAGE_BURST_WINDOW_MS;
}

export function markAcceptedImageEvent(userId, eventTimestamp) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  lastAcceptedImageEventAtMap.set(normalizedUserId, eventTimestamp);
}

export function bumpUserFlowVersion(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return 0;

  const nextVersion = (userFlowVersionMap.get(normalizedUserId) || 0) + 1;
  userFlowVersionMap.set(normalizedUserId, nextVersion);
  return nextVersion;
}

export function getUserFlowVersion(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return 0;

  return userFlowVersionMap.get(normalizedUserId) || 0;
}

export function isCurrentFlowVersion(userId, version) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  return (userFlowVersionMap.get(normalizedUserId) || 0) === Number(version || 0);
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

export function getLatestScanJobId(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;

  return latestScanJobMap.get(normalizedUserId) || null;
}

export function blockUserForRequest(userId, ttlMs = REQUEST_BLOCK_TTL_MS) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  requestBlockedUsersMap.set(normalizedUserId, Date.now() + ttlMs);
}

export function isUserBlockedForRequest(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  const expireAt = requestBlockedUsersMap.get(normalizedUserId);
  if (!expireAt) return false;

  if (Date.now() >= expireAt) {
    requestBlockedUsersMap.delete(normalizedUserId);
    return false;
  }

  return true;
}

export function clearUserRequestBlock(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  requestBlockedUsersMap.delete(normalizedUserId);
}

export function cleanupExpiredRequestBlocks() {
  const now = Date.now();

  for (const [userId, expireAt] of requestBlockedUsersMap.entries()) {
    if (now >= expireAt) {
      requestBlockedUsersMap.delete(userId);
    }
  }
}

export function setPendingImageCandidate(userId, payload) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  pendingImageCandidateMap.set(normalizedUserId, {
    eventTimestamp: Number(payload?.eventTimestamp || Date.now()),
    firstMessageId: payload?.firstMessageId || null,
    latestMessageId: payload?.latestMessageId || payload?.firstMessageId || null,
    replyToken: payload?.replyToken || null,
    flowVersion: Number(payload?.flowVersion || 0),
    count: Number(payload?.count || 1),
  });
}

export function getPendingImageCandidate(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;

  return pendingImageCandidateMap.get(normalizedUserId) || null;
}

export function hasPendingImageCandidate(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  return pendingImageCandidateMap.has(normalizedUserId);
}

export function registerImageCandidateEvent(userId, payload) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;

  const existing = pendingImageCandidateMap.get(normalizedUserId);

  if (!existing) {
    const created = {
      eventTimestamp: Number(payload?.eventTimestamp || Date.now()),
      firstMessageId: payload?.messageId || null,
      latestMessageId: payload?.messageId || null,
      replyToken: payload?.replyToken || null,
      flowVersion: Number(payload?.flowVersion || 0),
      count: 1,
    };
    pendingImageCandidateMap.set(normalizedUserId, created);
    return created;
  }

  const updated = {
    ...existing,
    latestMessageId: payload?.messageId || existing.latestMessageId,
    replyToken: payload?.replyToken || existing.replyToken,
    count: Number(existing.count || 1) + 1,
  };

  pendingImageCandidateMap.set(normalizedUserId, updated);
  return updated;
}

export function clearPendingImageCandidate(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  pendingImageCandidateMap.delete(normalizedUserId);
}

export function isCandidateWindowActive(userId, now = Date.now()) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  const candidate = pendingImageCandidateMap.get(normalizedUserId);
  if (!candidate?.eventTimestamp) return false;

  return now - candidate.eventTimestamp < IMAGE_CANDIDATE_WINDOW_MS;
}

export function clearExpiredImageCandidates() {
  const now = Date.now();

  for (const [userId, candidate] of pendingImageCandidateMap.entries()) {
    if (!candidate?.eventTimestamp) {
      pendingImageCandidateMap.delete(userId);
      continue;
    }

    if (now - candidate.eventTimestamp >= IMAGE_CANDIDATE_WINDOW_MS * 3) {
      pendingImageCandidateMap.delete(userId);
    }
  }
}

export function getRuntimeConfig() {
  return {
    imageBurstWindowMs: IMAGE_BURST_WINDOW_MS,
    imageBurstWindowSec: Math.ceil(IMAGE_BURST_WINDOW_MS / 1000),
    requestBlockTtlMs: REQUEST_BLOCK_TTL_MS,
    requestBlockTtlSec: Math.ceil(REQUEST_BLOCK_TTL_MS / 1000),
    imageCandidateWindowMs: IMAGE_CANDIDATE_WINDOW_MS,
    imageCandidateWindowSec: IMAGE_CANDIDATE_WINDOW_MS / 1000,
  };
}

export function clearUserRuntime(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  activeImageUsers.delete(normalizedUserId);
  lastAcceptedImageEventAtMap.delete(normalizedUserId);
  latestScanJobMap.delete(normalizedUserId);
  userFlowVersionMap.delete(normalizedUserId);
  requestBlockedUsersMap.delete(normalizedUserId);
  pendingImageCandidateMap.delete(normalizedUserId);
}