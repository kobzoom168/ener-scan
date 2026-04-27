import test from "node:test";
import assert from "node:assert/strict";
import {
  rankGlobalObjectBaselinePhashCandidates,
} from "../../src/stores/scanV2/globalObjectBaselines.db.js";
import { hammingDistance } from "../../src/services/imageDedup/imagePhash.util.js";

test("hammingDistance: exact hash is zero and one-nibble diff is four", () => {
  assert.equal(hammingDistance("0000000000000000", "0000000000000000"), 0);
  assert.equal(hammingDistance("0000000000000000", "f000000000000000"), 4);
});

test("rankGlobalObjectBaselinePhashCandidates: returns near matches only", () => {
  const current = "aaaaaaaaaaaaaaaa";
  const rows = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      image_sha256: "a".repeat(64),
      image_phash: "aaaaaaaaaaaaaaaa",
      lane: "sacred_amulet",
      object_family: "sacred_amulet",
      peak_power_key: "luck",
      created_at: "2026-04-27T00:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      image_sha256: "b".repeat(64),
      image_phash: "ffffaaaaaaaaaaaa",
      lane: "sacred_amulet",
      object_family: "sacred_amulet",
      peak_power_key: "metta",
      created_at: "2026-04-26T00:00:00.000Z",
    },
  ];

  const candidates = rankGlobalObjectBaselinePhashCandidates(current, rows, {
    maxDistance: 3,
    lane: "sacred_amulet",
    objectFamily: "sacred_amulet",
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].baselineId, "11111111-1111-4111-8111-111111111111");
  assert.equal(candidates[0].phashDistance, 0);
});

test("rankGlobalObjectBaselinePhashCandidates: invalid phash yields no candidates", () => {
  const candidates = rankGlobalObjectBaselinePhashCandidates("bad", [
    {
      id: "11111111-1111-4111-8111-111111111111",
      image_sha256: "a".repeat(64),
      image_phash: "aaaaaaaaaaaaaaaa",
      lane: "sacred_amulet",
      object_family: "sacred_amulet",
    },
  ]);
  assert.deepEqual(candidates, []);
});
