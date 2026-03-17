const userProfileMap = new Map();

export function getUserProfile(userId) {
  return userProfileMap.get(userId) || null;
}

export function getSavedBirthdate(userId) {
  const profile = userProfileMap.get(userId);
  return profile?.birthdate || null;
}

export function saveBirthdate(userId, birthdate) {
  const current = userProfileMap.get(userId) || {};

  userProfileMap.set(userId, {
    ...current,
    birthdate,
    updatedAt: Date.now(),
  });
}

export function clearSavedBirthdate(userId) {
  const current = userProfileMap.get(userId);
  if (!current) return;

  const next = { ...current };
  delete next.birthdate;
  next.updatedAt = Date.now();

  userProfileMap.set(userId, next);
}