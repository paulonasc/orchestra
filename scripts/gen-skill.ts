/**
 * SKILL.md template generator — makes SKILL.md a build artifact.
 *
 * Usage:
 *   bun scripts/gen-skill.ts            # Generate SKILL.md (reference mode, small)
 *   bun scripts/gen-skill.ts --full     # Generate SKILL.md with templates inlined
 *   bun scripts/gen-skill.ts --dry-run  # Check if SKILL.md is up to date (CI)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const TEMPLATE = join(ROOT, "SKILL.md.tmpl");
const OUTPUT = join(ROOT, "SKILL.md");
const TEMPLATES_DIR = join(ROOT, "templates");

// Each placeholder maps to its template file and the exact text it produces
// in reference mode (must match what was in SKILL.md before templatization).
const placeholders: Record<
  string,
  { file: string; ref: string }
> = {
  "{{VERIFICATION_FORMAT}}": {
    file: "thread-verification.md",
    ref: "Read `templates/thread-verification.md` for the verification document format.",
  },
  "{{DECISION_FORMAT}}": {
    file: "decision.md",
    ref: "read `templates/decision.md` for the format",
  },
  "{{BRIEFING_FORMAT}}": {
    file: "briefing.md",
    ref: "Read `templates/briefing.md` for the format.",
  },
  "{{HANDOFF_FORMAT}}": {
    file: "handoff.md",
    ref: "Read `templates/handoff.md` for the format.",
  },
  "{{SESSION_FORMAT}}": {
    file: "session.md",
    ref: "Read `templates/session.md` for the session context format.",
  },
  "{{BACKLOG_FORMAT}}": {
    file: "backlog.md",
    ref: "Read `templates/backlog.md` for the format.",
  },
  "{{PROGRESS_FORMAT}}": {
    file: "progress.yaml.example",
    ref: "YAML with milestones and items.",
  },
};

const full = process.argv.includes("--full");
const dryRun = process.argv.includes("--dry-run");

// --- Validate template source exists ---
if (!existsSync(TEMPLATE)) {
  console.error(`ERROR: Template not found at ${TEMPLATE}`);
  process.exit(1);
}

// --- Validate all referenced template files exist ---
let errors = 0;
for (const [placeholder, { file }] of Object.entries(placeholders)) {
  const path = join(TEMPLATES_DIR, file);
  if (!existsSync(path)) {
    console.error(
      `ERROR: ${placeholder} references ${file} but ${path} does not exist`
    );
    errors++;
  }
}
if (errors > 0) process.exit(1);

// --- Read and process template ---
let content = readFileSync(TEMPLATE, "utf-8");

for (const [placeholder, { file, ref }] of Object.entries(placeholders)) {
  if (full) {
    // Inline mode: embed template content in a fenced code block
    const ext = file.endsWith(".yaml.example") ? "yaml" : "markdown";
    const templateContent = readFileSync(
      join(TEMPLATES_DIR, file),
      "utf-8"
    ).trim();
    content = content.replace(
      placeholder,
      `\`\`\`${ext}\n${templateContent}\n\`\`\``
    );
  } else {
    // Reference mode (default): restore the original prose reference
    content = content.replace(placeholder, ref);
  }
}

// --- Verify no unreplaced generator placeholders remain ---
const knownPlaceholders = Object.keys(placeholders);
const remaining = knownPlaceholders.filter((p) => content.includes(p));
if (remaining.length > 0) {
  console.error(
    `ERROR: Unreplaced placeholders in output: ${remaining.join(", ")}`
  );
  process.exit(1);
}

// --- Output ---
if (dryRun) {
  if (existsSync(OUTPUT)) {
    const existing = readFileSync(OUTPUT, "utf-8");
    if (existing === content) {
      console.log("SKILL.md is up to date.");
      process.exit(0);
    } else {
      console.error(
        "SKILL.md is stale. Run `bun run gen:skill` to regenerate."
      );
      process.exit(1);
    }
  } else {
    console.error(
      "SKILL.md does not exist. Run `bun run gen:skill` to generate."
    );
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, content);
  const lines = content.split("\n").length;
  console.log(
    `Generated SKILL.md (${lines} lines, ${full ? "full" : "reference"} mode)`
  );
}
