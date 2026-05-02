/**
 * System Three Task Packet Validator v0
 *
 * Usage as CLI (Bun-specific):
 *   bun run scripts/system3/validate-task-packet.ts <path-to-task-packet.json>
 *
 * Exit codes:
 *   0 — valid task packet
 *   1 — invalid task packet (errors printed to stderr)
 *
 * The `import.meta.main` guard is Bun-specific and enables tests to import
 * `validateTaskPacket` without side effects.
 */

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

const RISK_TIERS = new Set(["T0", "T1", "T2", "T3", "T4"])
const STATUS_VALUES = new Set([
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "complete",
  "rejected",
])
const APPROVAL_STATUSES = new Set([
  "draft",
  "pending",
  "approved",
  "rejected",
])

const SCHEMA_VERSION_RE = /^0\.\d+\.\d+$/

// RFC 3339 regex with capture groups for range validation
// Matches: 2024-05-01T18:00:00Z or 2024-05-01T18:00:00+02:00 or 2024-05-01T18:00:00-05:30
const RFC3339_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/

function isString(val: unknown): val is string {
  return typeof val === "string"
}

function isBoolean(val: unknown): val is boolean {
  return typeof val === "boolean"
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val)
}

function pushError(errors: string[], path: string, message: string) {
  errors.push(`${path}: ${message}`)
}

function validateRfc3339(
  errors: string[],
  path: string,
  value: unknown,
  required: boolean,
): void {
  if (value === undefined || value === null) {
    if (required) pushError(errors, path, "required")
    return
  }

  if (!isString(value)) {
    pushError(errors, path, "must be a string")
    return
  }

  const m = RFC3339_RE.exec(value)
  if (!m) {
    pushError(errors, path, "invalid RFC 3339 format")
    return
  }

  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  const hour = parseInt(m[4], 10)
  const minute = parseInt(m[5], 10)
  const second = parseInt(m[6], 10)

  if (month < 1 || month > 12) {
    pushError(errors, path, "month out of range")
    return
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  if (day < 1 || day > daysInMonth) {
    pushError(errors, path, "day out of range")
    return
  }

  if (hour > 23) {
    pushError(errors, path, "hour out of range")
    return
  }
  if (minute > 59) {
    pushError(errors, path, "minute out of range")
    return
  }
  if (second > 59) {
    pushError(errors, path, "second out of range")
    return
  }
}

function validateClosedObject(
  errors: string[],
  path: string,
  value: unknown,
  allowedKeys: Set<string>,
  validateFields: (obj: Record<string, unknown>, p: string) => void,
): void {
  if (!isPlainObject(value)) {
    pushError(errors, path, "must be an object")
    return
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${path}.${key}`, "unknown key")
    }
  }

  validateFields(value, path)
}

export function validateTaskPacket(packet: unknown): ValidationResult {
  const errors: string[] = []

  if (!isPlainObject(packet)) {
    return { ok: false, errors: ["root: must be an object"] }
  }

  // Required string fields
  const requiredStrings = [
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
  ] as const

  for (const key of requiredStrings) {
    if (!(key in packet)) {
      pushError(errors, key, "required")
      continue
    }
    if (!isString(packet[key])) {
      pushError(errors, key, "must be a string")
    }
  }

  // schema_version
  if (isString(packet.schema_version)) {
    if (!SCHEMA_VERSION_RE.test(packet.schema_version)) {
      pushError(errors, "schema_version", "must match 0.x.y")
    }
  }

  // risk_tier enum
  if (isString(packet.risk_tier) && !RISK_TIERS.has(packet.risk_tier)) {
    pushError(errors, "risk_tier", "invalid value")
  }

  // status enum
  if (!("status" in packet)) {
    pushError(errors, "status", "required")
  } else if (!isString(packet.status)) {
    pushError(errors, "status", "must be a string")
  } else if (!STATUS_VALUES.has(packet.status)) {
    pushError(errors, "status", "invalid value")
  }

  // allowed_paths: non-empty string array
  if (!("allowed_paths" in packet)) {
    pushError(errors, "allowed_paths", "required")
  } else if (!Array.isArray(packet.allowed_paths)) {
    pushError(errors, "allowed_paths", "must be an array")
  } else if (packet.allowed_paths.length === 0) {
    pushError(errors, "allowed_paths", "must not be empty")
  } else {
    for (let i = 0; i < packet.allowed_paths.length; i++) {
      if (!isString(packet.allowed_paths[i])) {
        pushError(errors, `allowed_paths[${i}]`, "must be a string")
      }
    }
  }

  // forbidden_paths: string array
  if (!("forbidden_paths" in packet)) {
    pushError(errors, "forbidden_paths", "required")
  } else if (!Array.isArray(packet.forbidden_paths)) {
    pushError(errors, "forbidden_paths", "must be an array")
  } else {
    for (let i = 0; i < packet.forbidden_paths.length; i++) {
      if (!isString(packet.forbidden_paths[i])) {
        pushError(errors, `forbidden_paths[${i}]`, "must be a string")
      }
    }
  }

  // required_checks: non-empty string array
  if (!("required_checks" in packet)) {
    pushError(errors, "required_checks", "required")
  } else if (!Array.isArray(packet.required_checks)) {
    pushError(errors, "required_checks", "must be an array")
  } else if (packet.required_checks.length === 0) {
    pushError(errors, "required_checks", "must not be empty")
  } else {
    for (let i = 0; i < packet.required_checks.length; i++) {
      if (!isString(packet.required_checks[i])) {
        pushError(errors, `required_checks[${i}]`, "must be a string")
      }
    }
  }

  // approval: closed object
  if (!("approval" in packet)) {
    pushError(errors, "approval", "required")
  } else {
    validateClosedObject(
      errors,
      "approval",
      packet.approval,
      new Set(["required", "status", "reason", "request_path"]),
      (obj, path) => {
        if (!("required" in obj)) {
          pushError(errors, `${path}.required`, "required")
        } else if (!isBoolean(obj.required)) {
          pushError(errors, `${path}.required`, "must be a boolean")
        }

        if (!("status" in obj)) {
          pushError(errors, `${path}.status`, "required")
        } else if (!isString(obj.status)) {
          pushError(errors, `${path}.status`, "must be a string")
        } else if (!APPROVAL_STATUSES.has(obj.status)) {
          pushError(errors, `${path}.status`, "invalid value")
        }

        if (!("reason" in obj)) {
          pushError(errors, `${path}.reason`, "required")
        } else if (!isString(obj.reason)) {
          pushError(errors, `${path}.reason`, "must be a string")
        }

        if (!("request_path" in obj)) {
          pushError(errors, `${path}.request_path`, "required")
        } else if (obj.request_path !== null && !isString(obj.request_path)) {
          pushError(errors, `${path}.request_path`, "must be a string or null")
        }
      },
    )
  }

  // memory_policy: closed object
  if (!("memory_policy" in packet)) {
    pushError(errors, "memory_policy", "required")
  } else {
    validateClosedObject(
      errors,
      "memory_policy",
      packet.memory_policy,
      new Set(["durable_write"]),
      (obj, path) => {
        if (!("durable_write" in obj)) {
          pushError(errors, `${path}.durable_write`, "required")
        } else if (!isBoolean(obj.durable_write)) {
          pushError(errors, `${path}.durable_write`, "must be a boolean")
        } else if (obj.durable_write === true) {
          pushError(errors, `${path}.durable_write`, "must be false in v0")
        }
      },
    )
  }

  // constraints: closed object with exactly 8 booleans
  if (!("constraints" in packet)) {
    pushError(errors, "constraints", "required")
  } else {
    const constraintKeys = new Set([
      "network",
      "new_dependencies",
      "package_manifest_changes",
      "lockfile_changes",
      "ci_changes",
      "secrets",
      "deployment",
      "protected_path_changes",
    ])
    validateClosedObject(
      errors,
      "constraints",
      packet.constraints,
      constraintKeys,
      (obj, path) => {
        for (const key of constraintKeys) {
          if (!(key in obj)) {
            pushError(errors, `${path}.${key}`, "required")
          } else if (!isBoolean(obj[key])) {
            pushError(errors, `${path}.${key}`, "must be a boolean")
          }
        }
      },
    )
  }

  // plan: non-empty string array
  if (!("plan" in packet)) {
    pushError(errors, "plan", "required")
  } else if (!Array.isArray(packet.plan)) {
    pushError(errors, "plan", "must be an array")
  } else if (packet.plan.length === 0) {
    pushError(errors, "plan", "must not be empty")
  } else {
    for (let i = 0; i < packet.plan.length; i++) {
      if (!isString(packet.plan[i])) {
        pushError(errors, `plan[${i}]`, "must be a string")
      }
    }
  }

  // outputs: array of objects with path, kind, description
  if (!("outputs" in packet)) {
    pushError(errors, "outputs", "required")
  } else if (!Array.isArray(packet.outputs)) {
    pushError(errors, "outputs", "must be an array")
  } else {
    for (let i = 0; i < packet.outputs.length; i++) {
      const out = packet.outputs[i]
      const p = `outputs[${i}]`
      if (!isPlainObject(out)) {
        pushError(errors, p, "must be an object")
        continue
      }
      if (!("path" in out)) {
        pushError(errors, `${p}.path`, "required")
      } else if (!isString(out.path)) {
        pushError(errors, `${p}.path`, "must be a string")
      }
      if (!("kind" in out)) {
        pushError(errors, `${p}.kind`, "required")
      } else if (!isString(out.kind)) {
        pushError(errors, `${p}.kind`, "must be a string")
      }
      if (!("description" in out)) {
        pushError(errors, `${p}.description`, "required")
      } else if (!isString(out.description)) {
        pushError(errors, `${p}.description`, "must be a string")
      }
    }
  }

  // created_at: strict RFC 3339
  if (!("created_at" in packet)) {
    pushError(errors, "created_at", "required")
  } else {
    validateRfc3339(errors, "created_at", packet.created_at, true)
  }

  // expires_at: optional strict RFC 3339
  if ("expires_at" in packet && packet.expires_at !== undefined) {
    validateRfc3339(errors, "expires_at", packet.expires_at, false)
  }

  // parent_id: optional string or null
  if ("parent_id" in packet) {
    const pid = packet.parent_id
    if (pid !== null && !isString(pid)) {
      pushError(errors, "parent_id", "must be a string or null")
    }
  }

  // budget: optional shape-only object
  if ("budget" in packet && packet.budget !== undefined) {
    if (!isPlainObject(packet.budget)) {
      pushError(errors, "budget", "must be an object")
    } else {
      const budget = packet.budget as Record<string, unknown>
      for (const key of ["max_tokens", "max_cost_usd", "max_files", "max_lines"]) {
        if (key in budget && typeof budget[key] !== "number") {
          pushError(errors, `budget.${key}`, "must be a number")
        }
      }
    }
  }

  // failure_policy: optional shape-only object
  if ("failure_policy" in packet && packet.failure_policy !== undefined) {
    if (!isPlainObject(packet.failure_policy)) {
      pushError(errors, "failure_policy", "must be an object")
    } else {
      const fp = packet.failure_policy as Record<string, unknown>
      if ("auto_debug" in fp && !isBoolean(fp.auto_debug)) {
        pushError(errors, "failure_policy.auto_debug", "must be a boolean")
      }
      if ("max_debug_rounds" in fp) {
        const rounds = fp.max_debug_rounds
        if (typeof rounds !== "number" || !Number.isInteger(rounds)) {
          pushError(errors, "failure_policy.max_debug_rounds", "must be an integer")
        } else if (rounds < 0 || rounds > 2) {
          pushError(errors, "failure_policy.max_debug_rounds", "must be in 0..2")
        }
      }
      if ("stop_on_scope_expansion" in fp && !isBoolean(fp.stop_on_scope_expansion)) {
        pushError(errors, "failure_policy.stop_on_scope_expansion", "must be a boolean")
      }
    }
  }

  // Top-level unknown keys pass validation (additive evolution)

  return { ok: errors.length === 0, errors }
}

// CLI entry point (Bun-specific)
if (import.meta.main) {
  const path = process.argv[2]
  if (!path) {
    console.error("Usage: bun run validate-task-packet.ts <path-to-task-packet.json>")
    process.exit(1)
  }

  const file = Bun.file(path)
  if (!(await file.exists())) {
    console.error(`File not found: ${path}`)
    process.exit(1)
  }

  let packet: unknown
  try {
    packet = await file.json()
  } catch {
    console.error(`Invalid JSON in ${path}`)
    process.exit(1)
  }

  const result = validateTaskPacket(packet)
  if (result.ok) {
    console.log("valid task packet")
    process.exit(0)
  } else {
    for (const err of result.errors) {
      console.error(err)
    }
    process.exit(1)
  }
}
