/** Fixture inputs for tuning / snapshot tests — moldavite lane. */
export const MOLDAVITE_TIMING_FIXTURES = [
  {
    id: "mv-work-mid",
    input: {
      birthdateIso: "1990-06-15",
      lane: "moldavite",
      primaryKey: "work",
      compatibilityScore: 72,
      ownerFitScore: 70,
    },
  },
  {
    id: "mv-money-mid",
    input: {
      birthdateIso: "1990-06-15",
      lane: "moldavite",
      primaryKey: "money",
      compatibilityScore: 72,
      ownerFitScore: 70,
    },
  },
  {
    id: "mv-relationship-mid",
    input: {
      birthdateIso: "1990-06-15",
      lane: "moldavite",
      primaryKey: "relationship",
      compatibilityScore: 72,
      ownerFitScore: 70,
    },
  },
  {
    id: "mv-work-high-compat",
    input: {
      birthdateIso: "1985-01-22",
      lane: "moldavite",
      primaryKey: "work",
      compatibilityScore: 90,
      ownerFitScore: 60,
    },
  },
  {
    id: "mv-relationship-low-compat",
    input: {
      birthdateIso: "1992-11-08",
      lane: "moldavite",
      primaryKey: "relationship",
      compatibilityScore: 48,
      ownerFitScore: 52,
    },
  },
  {
    id: "mv-life-rhythm-bd2",
    input: {
      birthdateIso: "2000-03-03",
      lane: "moldavite",
      primaryKey: "life_rhythm",
      compatibilityScore: 66,
      ownerFitScore: 68,
    },
  },
  {
    id: "mv-owner-fit-bd3",
    input: {
      birthdateIso: "1978-12-19",
      lane: "moldavite",
      primaryKey: "owner_fit",
      compatibilityScore: 70,
      ownerFitScore: 88,
    },
  },
  {
    id: "mv-work-bd4",
    input: {
      birthdateIso: "1988-03-21",
      lane: "moldavite",
      primaryKey: "work",
      compatibilityScore: 75,
      ownerFitScore: 75,
    },
  },
  {
    id: "mv-relationship-bd4",
    input: {
      birthdateIso: "1988-03-21",
      lane: "moldavite",
      primaryKey: "relationship",
      compatibilityScore: 75,
      ownerFitScore: 75,
    },
  },
];
