const userStatsMap = new Map();

export function updateUserStats(userId, scanItem) {
  if (!userStatsMap.has(userId)) {
    userStatsMap.set(userId, {
      totalScans: 0,
      energies: {},
      scoreSum: 0,
      lastScanAt: null,
    });
  }

  const stats = userStatsMap.get(userId);

  stats.totalScans += 1;
  stats.lastScanAt = scanItem.time;

  const energy = scanItem.mainEnergy || "ไม่ทราบ";
  stats.energies[energy] = (stats.energies[energy] || 0) + 1;

  const score = Number(scanItem.energyScore);
  if (!Number.isNaN(score)) {
    stats.scoreSum += score;
  }

  userStatsMap.set(userId, stats);
}

export function getUserStats(userId) {
  const stats = userStatsMap.get(userId);

  if (!stats) {
    return null;
  }

  let topEnergy = "-";
  let topCount = 0;

  for (const [energy, count] of Object.entries(stats.energies)) {
    if (count > topCount) {
      topEnergy = energy;
      topCount = count;
    }
  }

  const avgScore =
    stats.totalScans > 0 ? (stats.scoreSum / stats.totalScans).toFixed(1) : "-";

  return {
    totalScans: stats.totalScans,
    topEnergy,
    avgScore,
    lastScanAt: stats.lastScanAt,
  };
}