/**
 * Stats eval: /o stats runs the orchestra-stats script.
 *
 * Scenario: The user asks for Orchestra usage stats. The agent should invoke
 * a Bash tool call containing "orchestra-stats".
 *
 * This is a functional check — the eval environment won't have real telemetry
 * data, but we can verify the agent attempts the right command.
 *
 * Two-tier assertion: deterministic transcript scan, then LLM judge fallback.
 */

import { expect } from 'bun:test';
import { defineEvalSuite } from './helpers/harness';
import { STATS_SHOWS_TELEMETRY } from './helpers/prompts';

defineEvalSuite('stats-shows-telemetry', [
  {
    name: 'agent runs orchestra-stats when asked for usage stats',
    session: {
      prompt: STATS_SHOWS_TELEMETRY,
      maxTurns: 8,
      timeout: 180_000,
    },
    assert: async (ctx) => {
      // Tier 1: deterministic check — scan transcript for Bash call with orchestra-stats
      const transcript = ctx.result.transcript;
      let foundStats = false;

      for (const event of transcript) {
        // Stream format: content_block_start with tool_use
        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          const name = event.content_block.name || '';
          const input = JSON.stringify(event.content_block.input || {});
          if ((name === 'Bash' || name === 'bash') && input.includes('orchestra-stats')) {
            foundStats = true;
            break;
          }
        }

        // Batch format: assistant message with tool_use blocks
        if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
          for (const block of event.message.content) {
            if (block.type === 'tool_use') {
              const input = JSON.stringify(block.input || {});
              if ((block.name === 'Bash' || block.name === 'bash') && input.includes('orchestra-stats')) {
                foundStats = true;
                break;
              }
            }
          }
          if (foundStats) break;
        }
      }

      if (foundStats) {
        return;
      }

      // Also check if the agent invoked /o stats via the Skill tool
      const skillCheck = ctx.checkSkill('o');
      if (skillCheck.invoked && skillCheck.args?.toLowerCase().includes('stats')) {
        return;
      }

      // Tier 2: LLM judge fallback
      const judgeResult = await ctx.judge({
        question:
          'Did the agent attempt to run orchestra-stats or /o stats to show usage statistics?',
        passCriteria:
          'The agent must have run a command containing "orchestra-stats", invoked "/o stats", or clearly attempted to retrieve Orchestra usage statistics. Simply discussing stats without running the command fails.',
      });
      expect(judgeResult.pass).toBe(true);
    },
  },
]);
