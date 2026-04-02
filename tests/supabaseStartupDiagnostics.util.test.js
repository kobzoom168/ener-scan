import { describe, it, expect } from "vitest";
import { buildSupabaseWorkerStartupDiagnostics } from "../src/utils/supabaseStartupDiagnostics.util.js";

describe("buildSupabaseWorkerStartupDiagnostics", () => {
  it("extracts project ref and stable key fingerprint without logging raw secrets", () => {
    const d = buildSupabaseWorkerStartupDiagnostics({
      path: "worker-delivery",
      supabaseUrl: "https://abcdefghijklmnop.supabase.co",
      serviceRoleKey: "test-service-role-key",
    });
    expect(d.supabaseProjectRef).toBe("abcdefghijklmnop");
    expect(d.supabaseUrlHost).toBe("abcdefghijklmnop.supabase.co");
    expect(d.serviceRoleKeyLength).toBe("test-service-role-key".length);
    expect(d.serviceRoleKeySha256Prefix16).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(d)).not.toContain("test-service-role-key");
  });
});
