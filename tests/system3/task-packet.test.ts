import { describe, expect, test } from "bun:test"
import { validateTaskPacket } from "../../scripts/system3/validate-task-packet.ts"

const requiredFields = [
  "schema_version",
  "id",
  "worker",
  "domain",
  "title",
  "description",
  "slice",
  "objective",
  "risk_tier",
  "risk_rationale",
  "allowed_paths",
  "forbidden_paths",
  "required_checks",
  "approval",
  "memory_policy",
  "constraints",
  "plan",
  "outputs",
  "created_at",
  "status",
] as const

function makeBase(): Record<string, unknown> {
  return {
    schema_version: "0.1.0",
    id: "test-id",
    worker: "pi",
    domain: "system3",
    title: "Test",
    description: "Test description",
    slice: "test_slice",
    objective: "Test objective",
    risk_tier: "T1",
    risk_rationale: "Low risk test",
    allowed_paths: ["a"],
    forbidden_paths: [],
    required_checks: ["check"],
    approval: {
      required: false,
      status: "draft",
      reason: "test",
      request_path: null,
    },
    memory_policy: { durable_write: false },
    constraints: {
      network: false,
      new_dependencies: false,
      package_manifest_changes: false,
      lockfile_changes: false,
      ci_changes: false,
      secrets: false,
      deployment: false,
      protected_path_changes: false,
    },
    plan: ["step 1"],
    outputs: [{ path: "a", kind: "file", description: "out" }],
    created_at: "2024-05-01T18:00:00Z",
    status: "draft",
  }
}

describe("task packet validator", () => {
  test("valid TEMPLATE.task.json passes round-trip from disk", async () => {
    const file = Bun.file(".system3/tasks/TEMPLATE.task.json")
    const packet = await file.json()
    const result = validateTaskPacket(packet)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  test.each(requiredFields)(
    "missing required field %s fails",
    (field) => {
      const base = makeBase()
      delete base[field]
      const result = validateTaskPacket(base)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => e.startsWith(`${field}:`))).toBe(true)
    },
  )

  test("missing worker fails", () => {
    const base = makeBase()
    delete base.worker
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.startsWith("worker:"))).toBe(true)
  })

  test("invalid risk_tier fails", () => {
    const base = makeBase()
    base.risk_tier = "T5"
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("risk_tier"))).toBe(true)
  })

  test("invalid status fails", () => {
    const base = makeBase()
    base.status = "unknown"
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("status"))).toBe(true)
  })

  test("allowed_paths empty fails", () => {
    const base = makeBase()
    base.allowed_paths = []
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("allowed_paths"))).toBe(true)
  })

  test("required_checks empty fails", () => {
    const base = makeBase()
    base.required_checks = []
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("required_checks"))).toBe(true)
  })

  test("memory_policy.durable_write true fails", () => {
    const base = makeBase()
    base.memory_policy = { durable_write: true }
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(
      result.errors.some((e) => e.includes("memory_policy.durable_write")),
    ).toBe(true)
  })

  test("TEMPLATE constraints default to false", async () => {
    const file = Bun.file(".system3/tasks/TEMPLATE.task.json")
    const packet = await file.json()
    const c = packet.constraints
    expect(c.network).toBe(false)
    expect(c.new_dependencies).toBe(false)
    expect(c.package_manifest_changes).toBe(false)
    expect(c.lockfile_changes).toBe(false)
    expect(c.ci_changes).toBe(false)
    expect(c.secrets).toBe(false)
    expect(c.deployment).toBe(false)
    expect(c.protected_path_changes).toBe(false)
  })

  test("unknown top-level extra field passes", () => {
    const base = makeBase()
    base.extra_field = "hello"
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("unknown key inside approval fails", () => {
    const base = makeBase()
    base.approval = {
      required: false,
      status: "draft",
      reason: "test",
      request_path: null,
      extra: 1,
    }
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("approval.extra"))).toBe(true)
  })

  test("unknown key inside memory_policy fails", () => {
    const base = makeBase()
    base.memory_policy = { durable_write: false, extra: 1 }
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(
      result.errors.some((e) => e.includes("memory_policy.extra")),
    ).toBe(true)
  })

  test("unknown key inside constraints fails", () => {
    const base = makeBase()
    base.constraints = {
      network: false,
      new_dependencies: false,
      package_manifest_changes: false,
      lockfile_changes: false,
      ci_changes: false,
      secrets: false,
      deployment: false,
      protected_path_changes: false,
      extra: true,
    }
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("constraints.extra"))).toBe(
      true,
    )
  })

  test('schema_version "1.0.0" fails', () => {
    const base = makeBase()
    base.schema_version = "1.0.0"
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("schema_version"))).toBe(true)
  })

  test('schema_version "0.1.999" passes', () => {
    const base = makeBase()
    base.schema_version = "0.1.999"
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(true)
  })

  test('created_at "2024-13-40T99:99:99Z" fails', () => {
    const base = makeBase()
    base.created_at = "2024-13-40T99:99:99Z"
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("created_at"))).toBe(true)
  })

  test('created_at "2024-05-01T18:00:00Z" passes', () => {
    const base = makeBase()
    base.created_at = "2024-05-01T18:00:00Z"
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(true)
  })

  test('created_at "2024-05-01T18:00:00+02:00" passes', () => {
    const base = makeBase()
    base.created_at = "2024-05-01T18:00:00+02:00"
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(true)
  })

  test("failure_policy.max_debug_rounds outside 0..2 fails", () => {
    const base = makeBase()
    base.failure_policy = { auto_debug: false, max_debug_rounds: 3, stop_on_scope_expansion: true }
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(false)
    expect(
      result.errors.some((e) => e.includes("failure_policy.max_debug_rounds")),
    ).toBe(true)
  })

  test("failure_policy.max_debug_rounds 2 passes", () => {
    const base = makeBase()
    base.failure_policy = { auto_debug: false, max_debug_rounds: 2, stop_on_scope_expansion: true }
    const result = validateTaskPacket(base)
    expect(result.ok).toBe(true)
  })
})
