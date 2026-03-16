const sessions = new Map();

function createEmptySession() {
  return {
    pendingImage: null,
    birthdate: null,
  };
}

export function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, createEmptySession());
  }

  return sessions.get(userId);
}

export function setPendingImage(userId, pendingImage) {
  const session = getSession(userId);
  session.pendingImage = pendingImage;
  sessions.set(userId, session);
}

export function setBirthdate(userId, birthdate) {
  const session = getSession(userId);
  session.birthdate = birthdate;
  sessions.set(userId, session);
}

export function clearSession(userId) {
  sessions.delete(userId);
}