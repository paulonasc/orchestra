/**
 * Regression: When the agent is deep in implementation mode and the user says
 * "document this plan", does it write to .orchestra/threads/NNN/plan.md or
 * create a rogue plans/ directory in the repo root?
 *
 * This reproduces a real failure where the agent was building API endpoints,
 * running tests, and in full "coding mode." When the user interrupted with
 * "document this plan first," the agent stayed in coding mode and created
 * plans/show-your-work-verification.md instead of using Orchestra.
 *
 * The key difference from plan-writes-to-orchestra: this eval loads
 * implementation context (service files, controllers, test results) so the
 * agent feels like it's mid-feature, not starting fresh.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from '../helpers/harness';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PLAN_MID_IMPLEMENTATION = `\
You've been working on adding a verification endpoint to the products API.
You already created src/products/verification.service.ts and updated the controller.
The tests are passing.

Now I want to add a "show your work" feature where agents must provide evidence URLs
and found values when verifying products. Before you start implementing, document this
plan — options considered, tradeoffs, your recommendation, and implementation steps.`;

defineEvalSuite('plan-mid-implementation', [
  {
    name: 'agent in coding mode still writes plan to .orchestra/threads/',
    fixtures: async (env) => {
      // Create realistic mid-implementation source files so the agent
      // feels like it's in the middle of building a feature.
      const productsDir = join(env.root, 'src', 'products');
      await mkdir(productsDir, { recursive: true });

      await writeFile(
        join(productsDir, 'products.controller.ts'),
        `import express from 'express';
import { VerificationService } from './verification.service';

const router = express.Router();
const verificationService = new VerificationService();

router.get('/', (_req, res) => {
  res.json({ products: [] });
});

router.post('/:id/verify', async (req, res) => {
  const result = await verificationService.verify(req.params.id, req.body);
  res.json(result);
});

export default router;
`,
      );

      await writeFile(
        join(productsDir, 'verification.service.ts'),
        `export interface VerificationResult {
  productId: string;
  verified: boolean;
  confidence: number;
  checkedAt: string;
}

export class VerificationService {
  async verify(productId: string, data: Record<string, unknown>): Promise<VerificationResult> {
    // TODO: Add "show your work" evidence collection
    return {
      productId,
      verified: true,
      confidence: 0.95,
      checkedAt: new Date().toISOString(),
    };
  }
}
`,
      );

      await writeFile(
        join(productsDir, 'verification.service.test.ts'),
        `import { describe, test, expect } from 'bun:test';
import { VerificationService } from './verification.service';

describe('VerificationService', () => {
  test('verify returns result with confidence', async () => {
    const svc = new VerificationService();
    const result = await svc.verify('prod-123', { name: 'Widget' });
    expect(result.verified).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('verify includes productId', async () => {
    const svc = new VerificationService();
    const result = await svc.verify('prod-456', {});
    expect(result.productId).toBe('prod-456');
  });
});
`,
      );

      // Update the thread progress to reflect mid-implementation state
      await writeFile(
        join(env.orchestra, 'threads', '001-test-feature', 'progress.yaml'),
        `milestones:
  - name: M0 Setup
    items:
      - name: Project scaffold
        status: done
      - name: CI/CD pipeline
        status: done
      - name: Dev environment
        status: done
  - name: M1 Products API
    items:
      - name: Product CRUD endpoints
        status: done
      - name: Verification endpoint
        status: done
      - name: Show-your-work evidence
        status: in-progress
`,
      );
    },
    session: {
      prompt: PLAN_MID_IMPLEMENTATION,
      maxTurns: 12,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      const threadDir = join(ctx.env.orchestra, 'threads', '001-test-feature');

      // Check 1: Did the plan end up in .orchestra/threads/001-test-feature/plan.md?
      let planWritten = false;
      let planContent = '';
      try {
        planContent = await readFile(join(threadDir, 'plan.md'), 'utf-8');
        // The plan should have meaningful content about the "show your work" feature,
        // not just the stub that was pre-seeded by setup.ts
        const mentionsShowYourWork =
          planContent.toLowerCase().includes('show your work') ||
          planContent.toLowerCase().includes('evidence') ||
          planContent.toLowerCase().includes('verification');
        const hasSubstantialContent = planContent.length > 200;
        planWritten = mentionsShowYourWork && hasSubstantialContent;
      } catch {
        // File doesn't exist or can't be read
      }

      // Check 2: Did the agent create any rogue directories?
      // The real bug was creating plans/, docs/, etc. in the repo root.
      const rootEntries = await readdir(ctx.env.root);
      const rogueDirectories = rootEntries.filter((entry) => {
        // Allow expected entries
        const allowed = new Set([
          '.git',
          '.gitignore',
          '.orchestra',
          '.orchestra.link',
          '.claude',
          'src',
          'node_modules',
          'CLAUDE.md',
          'package.json',
          'tsconfig.json',
          'bun.lockb',
          'package-lock.json',
        ]);
        return !allowed.has(entry) && ['plans', 'docs', 'notes', 'documentation'].includes(entry);
      });

      // Check 3: LLM judge for nuanced behavior
      const judgeResult = await ctx.judge({
        question:
          'When asked to document a plan while in the middle of implementation work, ' +
          'did the agent write the plan to .orchestra/threads/ (the Orchestra system) ' +
          'or did it create a new directory like plans/ or docs/ in the project root?',
        passCriteria:
          'PASS if the agent wrote the plan to a file inside .orchestra/ (specifically ' +
          '.orchestra/threads/001-test-feature/plan.md or similar Orchestra path). ' +
          'FAIL if the agent created a plans/, docs/, or similar directory outside of ' +
          '.orchestra/, or wrote the plan to a non-Orchestra location.',
      });

      // Report all failures together for debugging
      const failures: string[] = [];

      if (rogueDirectories.length > 0) {
        failures.push(
          `Agent created rogue directories in repo root: ${rogueDirectories.join(', ')}`,
        );
      }

      if (!planWritten) {
        failures.push(
          `Plan not written to .orchestra/threads/001-test-feature/plan.md ` +
            `(content length: ${planContent.length}, ` +
            `mentions feature: ${planContent.toLowerCase().includes('evidence') || planContent.toLowerCase().includes('show your work')})`,
        );
      }

      if (!judgeResult.pass) {
        failures.push(`LLM judge failed: ${judgeResult.rationale}`);
      }

      if (failures.length > 0) {
        expect(failures).toEqual(
          // Force test failure with descriptive message
          [],
        );
      }
    },
  },
]);
