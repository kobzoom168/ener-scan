const activeImageUsers = new Set();
const lastAcceptedImageEventAtMap = new Map();
const latestScanJobMap = new Map();
const userFlowVersionMap = new Map();

const IMAGE_BURST_WINDOW_MS = 8000;

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

  return (userFlowVersionMap.get(normalizedUserId) || 0) === version;
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

export function clearUserRuntime(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  activeImageUsers.delete(normalizedUserId);
  lastAcceptedImageEventAtMap.delete(normalizedUserId);
  latestScanJobMap.delete(normalizedUserId);
  userFlowVersionMap.delete(normalizedUserId);
}

export function getRuntimeConfig() {
  return {
    imageBurstWindowMs: IMAGE_BURST_WINDOW_MS,
    imageBurstWindowSec: Math.ceil(IMAGE_BURST_WINDOW_MS / 1000),
  };
}