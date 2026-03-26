/**
 * Session runner: uses the Claude Agent SDK to run eval sessions.
 *
 * Uses `query()` from @anthropic-ai/claude-agent-sdk instead of spawning
 * `claude -p` as a subprocess. This avoids the nested session restriction
 * (claude -p refuses to launch inside another Claude Code session).
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface SessionResult {
  toolCalls: Array<{ tool: string; input: any; output: string }>;
  exitReason: 'success' | 'timeout' | 'error' | string;
  duration: number;
  output: string;
  transcript: any[];
  model: string;
  turnsUsed: number;
  estimatedCost: number;
}

export interface SessionOptions {
  prompt: string;
  workingDirectory: string;
  maxTurns?: number;
  allowedTools?: string[];
  timeout?: number;
  testName?: string;
  model?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT = 180_000; // 3 minutes
const DEFAULT_MAX_TURNS = 15;
const RUNS_DIR = join(import.meta.dir, '..', 'runs');

/**
 * Run a full agent session via the Claude Agent SDK and return structured results.
 */
export async function runSession(options: SessionOptions): Promise<SessionResult> {
  const model = options.model || process.env.EVALS_MODEL || DEFAULT_MODEL;
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const maxTurns = options.maxTurns || DEFAULT_MAX_TURNS;

  const startTime = Date.now();
  const transcript: any[] = [];
  const toolCalls: Array<{ tool: string; input: any; output: string }> = [];
  let output = '';
  let exitReason: string = 'success';
  let turnsUsed = 0;
  let estimatedCost = 0;

  // Timeout via AbortController
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeout);

  try {
    const q = query({
      prompt: options.prompt,
      options: {
        allowDangerouslySkipPermissions: true,
        permissionMode: 'bypassPermissions',
        maxTurns,
        cwd: options.workingDirectory,
        model,
        settingSources: ['user', 'project', 'local'],
        allowedTools: options.allowedTools || [
          'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Skill',
        ],
      },
    });

    // Wire up abort
    abortController.signal.addEventListener('abort', () => q.close());

    for await (const message of q) {
      transcript.push(message);

      // Extract tool calls from assistant messages
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of (message as any).message.content) {
          if (block.type === 'tool_use') {
            toolCalls.push({
              tool: block.name || 'unknown',
              input: block.input || {},
              output: '',
            });
          }
        }
      }

      // Extract result
      if (message.type === 'result') {
        const resultMsg = message as any;
        if (resultMsg.subtype === 'success') {
          exitReason = 'success';
          output = resultMsg.result || '';
        } else {
          exitReason = resultMsg.subtype || 'error';
        }
        turnsUsed = resultMsg.num_turns || 0;
        estimatedCost = resultMsg.total_cost_usd || 0;
      }
    }
  } catch (err: any) {
    if (abortController.signal.aborted) {
      exitReason = 'timeout';
    } else {
      exitReason = 'error';
      output = err.message || String(err);
    }
  } finally {
    clearTimeout(timer);
  }

  const duration = Date.now() - startTime;

  const sessionResult: SessionResult = {
    toolCalls,
    exitReason,
    duration,
    output,
    transcript,
    model,
    turnsUsed,
    estimatedCost,
  };

  // Save failure transcripts for debugging
  if (exitReason !== 'success') {
    saveTranscript(sessionResult, options.testName);
  }

  return sessionResult;
}

/**
 * Save a transcript to the runs directory for post-mortem debugging.
 */
function saveTranscript(result: SessionResult, testName?: string): void {
  try {
    mkdirSync(RUNS_DIR, { recursive: true });
    const slug = testName?.replace(/[^a-zA-Z0-9-]/g, '_') || 'unknown';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${slug}-${ts}.json`;
    writeFileSync(
      join(RUNS_DIR, filename),
      JSON.stringify(result, null, 2),
      'utf-8',
    );
  } catch {
    // Best-effort — don't crash the test runner
  }
}
