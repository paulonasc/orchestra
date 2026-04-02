/**
 * SKILL.md generator + split structure validator.
 *
 * Usage:
 *   bun scripts/gen-skill.ts            # Generate SKILL.md from template
 *   bun scripts/gen-skill.ts --dry-run  # Check if SKILL.md is up to date + validate structure (CI)
 *
 * The template (SKILL.md.tmpl) IS the router — ~227 lines. gen-skill.ts copies it
 * to SKILL.md (the build artifact). The value of the generator:
 * 1. CI freshness check (gen:skill:check) catches stale SKILL.md
 * 2. Validates all command and reference files referenced in routing table exist
 * 3. Detects orphaned files not in the routing table
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const TEMPLATE = join(ROOT, "SKILL.md.tmpl");
const OUTPUT = join(ROOT, "SKILL.md");
const COMMANDS_DIR = join(ROOT, "commands");
const REFERENCE_DIR = join(ROOT, "reference");

// Expected files — must match the routing table in SKILL.md.tmpl
const EXPECTED_COMMANDS = [
  "dashboard.md",
  "checkpoint.md",
  "close.md",
  "import.md",
  "docs.md",
  "heartbeat.md",
  "list.md",
  "update.md",
];

const EXPECTED_REFERENCES = [
  "memory.md",
  "threads.md",
  "verification.md",
  "formats.md",
];

const dryRun = process.argv.includes("--dry-run");

// --- Validate template exists ---
if (!existsSync(TEMPLATE)) {
  console.error(`ERROR: Template not found at ${TEMPLATE}`);
  process.exit(1);
}

// --- Validate command files exist ---
let errors = 0;
for (const file of EXPECTED_COMMANDS) {
  if (!existsSync(join(COMMANDS_DIR, file))) {
    console.error(`ERROR: Missing command file: commands/${file}`);
    errors++;
  }
}

// --- Validate reference files exist ---
for (const file of EXPECTED_REFERENCES) {
  if (!existsSync(join(REFERENCE_DIR, file))) {
    console.error(`ERROR: Missing reference file: reference/${file}`);
    errors++;
  }
}

// --- Detect orphaned files ---
if (existsSync(COMMANDS_DIR)) {
  const actual = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".md"));
  for (const file of actual) {
    if (!EXPECTED_COMMANDS.includes(file)) {
      console.warn(`WARNING: Orphaned command file: commands/${file} (not in routing table)`);
    }
  }
}

if (existsSync(REFERENCE_DIR)) {
  const actual = readdirSync(REFERENCE_DIR).filter((f) => f.endsWith(".md"));
  for (const file of actual) {
    if (!EXPECTED_REFERENCES.includes(file)) {
      console.warn(`WARNING: Orphaned reference file: reference/${file} (not referenced)`);
    }
  }
}

if (errors > 0) process.exit(1);

// --- Generate SKILL.md from template ---
const content = readFileSync(TEMPLATE, "utf-8");

if (dryRun) {
  if (existsSync(OUTPUT)) {
    const existing = readFileSync(OUTPUT, "utf-8");
    if (existing === content) {
      console.log("SKILL.md is up to date.");
      console.log(`Validated: ${EXPECTED_COMMANDS.length} commands, ${EXPECTED_REFERENCES.length} references.`);
      process.exit(0);
    } else {
      console.error("SKILL.md is stale. Run `bun run gen:skill` to regenerate.");
      process.exit(1);
    }
  } else {
    console.error("SKILL.md does not exist. Run `bun run gen:skill` to generate.");
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, content);
  const lines = content.split("\n").length;
  console.log(`Generated SKILL.md (${lines} lines)`);
  console.log(`Validated: ${EXPECTED_COMMANDS.length} commands, ${EXPECTED_REFERENCES.length} references.`);
}
