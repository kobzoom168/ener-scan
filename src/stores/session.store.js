const sessions = new Map();

function normalizeUserId(userId) {
  return String(userId || "").trim();
}

function createEmptySession() {
  return {
    pendingImage: null,
    birthdate: null,
    flowVersion: 0,
  };
}

export function getSession(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return createEmptySession();

  if (!sessions.has(normalizedUserId)) {
    sessions.set(normalizedUserId, createEmptySession());
  }

  return sessions.get(normalizedUserId);
}

export function setPendingImage(userId, pendingImage, flowVersion = null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = getSession(normalizedUserId);

  session.pendingImage = pendingImage;
  if (flowVersion !== null && flowVersion !== undefined) {
    session.flowVersion = flowVersion;
  }

  sessions.set(normalizedUserId, session);
}

export function setBirthdate(userId, birthdate, flowVersion = null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = getSession(normalizedUserId);

  session.birthdate = birthdate;
  if (flowVersion !== null && flowVersion !== undefined) {
    session.flowVersion = flowVersion;
  }

  sessions.set(normalizedUserId, session);
}

export function setSessionFlowVersion(userId, flowVersion) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = getSession(normalizedUserId);
  session.flowVersion = Number(flowVersion || 0);

  sessions.set(normalizedUserId, session);
}

export function isSessionFlowVersion(userId, flowVersion) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  const session = sessions.get(normalizedUserId);
  if (!session) return false;

  return Number(session.flowVersion || 0) === Number(flowVersion || 0);
}

export function clearPendingImage(userId, flowVersion = null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = sessions.get(normalizedUserId);
  if (!session) return;

  if (
    flowVersion !== null &&
    flowVersion !== undefined &&
    Number(session.flowVersion || 0) !== Number(flowVersion || 0)
  ) {
    return;
  }

  session.pendingImage = null;
  sessions.set(normalizedUserId, session);
}

export function clearSession(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  sessions.delete(normalizedUserId);
}

export function clearSessionIfFlowVersionMatches(userId, flowVersion) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  const session = sessions.get(normalizedUserId);
  if (!session) return;

  if (Number(session.flowVersion || 0) !== Number(flowVersion || 0)) {
    return;
  }

  sessions.delete(normalizedUserId);
}