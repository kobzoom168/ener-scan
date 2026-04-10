/** Fixture inputs for tuning / snapshot tests — sacred_amulet lane. */
export const SACRED_AMULET_TIMING_FIXTURES = [
  {
    id: "sa-protection-mid",
    input: {
      birthdateIso: "1990-06-15",
      lane: "sacred_amulet",
      primaryKey: "protection",
      compatibilityScore: 72,
      ownerFitScore: 70,
    },
  },
  {
    id: "sa-luck-mid",
    input: {
      birthdateIso: "1990-06-15",
      lane: "sacred_amulet",
      primaryKey: "luck",
      compatibilityScore: 72,
      ownerFitScore: 70,
    },
  },
  {
    id: "sa-metta-high-compat",
    input: {
      birthdateIso: "1985-01-22",
      lane: "sacred_amulet",
      primaryKey: "metta",
      compatibilityScore: 88,
      ownerFitScore: 82,
    },
  },
  {
    id: "sa-baramee-low-fit",
    input: {
      birthdateIso: "1992-11-08",
      lane: "sacred_amulet",
      primaryKey: "baramee",
      compatibilityScore: 55,
      ownerFitScore: 48,
    },
  },
  {
    id: "sa-fortune-anchor-bd2",
    input: {
      birthdateIso: "2000-03-03",
      lane: "sacred_amulet",
      primaryKey: "fortune_anchor",
      compatibilityScore: 66,
      ownerFitScore: 66,
    },
  },
  {
    id: "sa-specialty-bd3",
    input: {
      birthdateIso: "1978-12-19",
      lane: "sacred_amulet",
      primaryKey: "specialty",
      secondaryKey: "protection",
      compatibilityScore: 74,
      ownerFitScore: 76,
    },
  },
  {
    id: "sa-protection-bd4-high-both",
    input: {
      birthdateIso: "1988-03-21",
      lane: "sacred_amulet",
      primaryKey: "protection",
      compatibilityScore: 90,
      ownerFitScore: 91,
    },
  },
  {
    id: "sa-luck-bd4-high-both",
    input: {
      birthdateIso: "1988-03-21",
      lane: "sacred_amulet",
      primaryKey: "luck",
      compatibilityScore: 90,
      ownerFitScore: 91,
    },
  },
];
