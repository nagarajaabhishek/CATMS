import { test } from "node:test";
import assert from "node:assert/strict";
import { scrub } from "../../templates/cams/scrub.ts";

const bad = [
  "my key is sk-or-v1-abcdef0123456789abcdef0123456789",
  "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcDEF123456xyz",
  "postgres://postgres:hunter2hunter2@db.example.com:5432/postgres",
  "password: correcthorsebattery",
  "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  "AKIAIOSFODNN7EXAMPLE",
  "Authorization: Bearer abcdef0123456789abcdef0123",
  "dp.st.dev.abcdefghijklmnop1234",
  "deadbeefdeadbeefdeadbeefdeadbeef0123",
];
for (const s of bad) test(`redacts: ${s.slice(0, 30)}`, () => {
  const out = scrub(s);
  assert.match(out, /REDACTED/);
  for (const secret of ["abcdef0123456789abcdef0123456789", "hunter2hunter2", "correcthorsebattery", "abcdefghijklmnopqrstuvwxyz0123456789", "IOSFODNN7EXAMPLE", "deadbeefdeadbeef", "abcDEF123456xyz", "eyJyb2xlIjoic2VydmljZV9yb2xlIn0"])
    assert.ok(!out.includes(secret), `leaked ${secret} in ${out}`);
});

const good = [
  "Which AI models are we allowed to call, and what happens if code asks for a different one?",
  "what did D-20260921-durable-execution-workflow-devkit-first decide?",
  "is task CAMS-1 done on logos-app dev (yhrbwyarzrjwgkthojzu is prod)?",
  "Why is the secret scan check failing on the self-hosted runner?",
];
for (const s of good) test(`keeps: ${s.slice(0, 30)}`, () => assert.equal(scrub(s), s));

test("very long input is truncated, not quadratic", () => {
  const t0 = Date.now();
  const out = scrub("a1".repeat(200_000));
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(out.length < 5000);
});
