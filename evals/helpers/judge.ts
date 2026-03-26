/**
 * LLM judge for behavioral compliance checks.
 *
 * Provides both LLM-based evaluation (judgeBehavior) and deterministic
 * checks (checkSkillInvocation, checkFileWrite) that scan transcripts
 * for specific tool calls without needing an LLM.
 */

import type { LLMProvider } from './providers';

export interface JudgeResult {
  pass: boolean;
  rationale: string;
}

/**
 * Ask an LLM judge whether the agent's behavior satisfies the given criteria.
 *
 * The judge receives a formatted summary of the transcript (tool calls and
 * text outputs) and evaluates it against the pass criteria.
 */
export async function judgeBehavior(
  provider: LLMProvider,
  transcript: any[],
  check: { question: string; passCriteria: string }
): Promise<JudgeResult> {
  const formattedTranscript = formatTranscript(transcript);

  const system = `You are an eval judge. You evaluate whether an AI agent's behavior meets specific criteria.

You will receive:
1. A transcript of the agent's actions (tool calls and text output)
2. A question about the agent's behavior
3. Pass criteria that define what counts as passing

Respond with ONLY a JSON object: {"pass": true/false, "rationale": "brief explanation"}
Do not include any other text.`;

  const user = `## Transcript

${formattedTranscript}

## Question

${check.question}

## Pass Criteria

${check.passCriteria}`;

  try {
    const response = await provider.complete(system, user);
    return parseJudgeResponse(response);
  } catch (err: any) {
    return {
      pass: false,
      rationale: `Judge error: ${err.message || String(err)}`,
    };
  }
}

/**
 * Deterministic check: did the agent invoke a specific skill?
 * Scans tool calls for the Skill tool with the expected skill name.
 */
export function checkSkillInvocation(
  transcript: any[],
  expectedSkill: string
): { invoked: boolean; args?: string } {
  const toolCalls = extractToolCalls(transcript);

  for (const call of toolCalls) {
    // Check for Skill tool invocation
    if (call.tool === 'Skill' || call.tool === 'skill') {
      const input = typeof call.input === 'string' ? call.input : JSON.stringify(call.input);
      if (input.includes(expectedSkill)) {
        const args =
          typeof call.input === 'object' ? call.input.args : undefined;
        return { invoked: true, args };
      }
    }

    // Also check for direct skill name as tool name (some formats)
    if (call.tool === expectedSkill) {
      return { invoked: true, args: JSON.stringify(call.input) };
    }
  }

  return { invoked: false };
}

/**
 * Deterministic check: did a tool call write to a file matching the given pattern?
 * Scans for Write, Edit, and Bash tool calls that target the path.
 */
export function checkFileWrite(
  transcript: any[],
  pathPattern: string | RegExp
): { written: boolean; content?: string } {
  const toolCalls = extractToolCalls(transcript);
  const pattern =
    typeof pathPattern === 'string' ? new RegExp(escapeRegExp(pathPattern)) : pathPattern;

  for (const call of toolCalls) {
    if (call.tool === 'Write' || call.tool === 'write') {
      const filePath = call.input?.file_path || call.input?.path || '';
      if (pattern.test(filePath)) {
        return { written: true, content: call.input?.content };
      }
    }

    if (call.tool === 'Edit' || call.tool === 'edit') {
      const filePath = call.input?.file_path || call.input?.path || '';
      if (pattern.test(filePath)) {
        return { written: true, content: call.input?.new_string };
      }
    }

    // Bash commands that redirect to files
    if (call.tool === 'Bash' || call.tool === 'bash') {
      const cmd = call.input?.command || '';
      if (pattern.test(cmd) && (cmd.includes('>') || cmd.includes('tee'))) {
        return { written: true, content: call.output };
      }
    }
  }

  return { written: false };
}

// --- Internal helpers ---

/**
 * Format a transcript into a human-readable summary for the judge.
 */
function formatTranscript(transcript: any[]): string {
  const lines: string[] = [];
  let turnNum = 0;

  for (const event of transcript) {
    // Text output from the assistant
    if (event.type === 'content_block_delta' && event.delta?.text) {
      lines.push(`[text] ${event.delta.text}`);
    }

    // Tool use
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const name = event.content_block.name || 'unknown';
      const input = JSON.stringify(event.content_block.input || {}).slice(0, 500);
      lines.push(`[tool_use] ${name}: ${input}`);
    }

    // Tool result
    if (event.type === 'tool_result') {
      const content =
        typeof event.content === 'string'
          ? event.content.slice(0, 500)
          : JSON.stringify(event.content || '').slice(0, 500);
      lines.push(`[tool_result] ${content}`);
    }

    // Turn boundaries
    if (event.type === 'message_start') {
      turnNum++;
      lines.push(`\n--- Turn ${turnNum} ---`);
    }

    // Assistant message blocks (alternative format)
    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      turnNum++;
      lines.push(`\n--- Turn ${turnNum} ---`);
      for (const block of event.message.content) {
        if (block.type === 'text') {
          lines.push(`[text] ${block.text.slice(0, 500)}`);
        } else if (block.type === 'tool_use') {
          const input = JSON.stringify(block.input || {}).slice(0, 500);
          lines.push(`[tool_use] ${block.name}: ${input}`);
        }
      }
    }
  }

  if (lines.length === 0) {
    return '(empty transcript)';
  }

  return lines.join('\n');
}

/**
 * Extract tool calls from any transcript format.
 */
function extractToolCalls(
  transcript: any[]
): Array<{ tool: string; input: any; output: string }> {
  const calls: Array<{ tool: string; input: any; output: string }> = [];

  for (const event of transcript) {
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      calls.push({
        tool: event.content_block.name || '',
        input: event.content_block.input || {},
        output: '',
      });
    }

    if (event.type === 'tool_result' || event.type === 'result') {
      const last = calls[calls.length - 1];
      if (last && !last.output) {
        last.output =
          typeof event.content === 'string'
            ? event.content
            : JSON.stringify(event.content || '');
      }
    }

    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        if (block.type === 'tool_use') {
          calls.push({
            tool: block.name || '',
            input: block.input || {},
            output: '',
          });
        }
      }
    }
  }

  return calls;
}

/**
 * Parse the judge's JSON response, handling malformed output gracefully.
 */
function parseJudgeResponse(response: string): JudgeResult {
  // Try to extract JSON from the response (handles markdown code blocks, extra text)
  const jsonMatch = response.match(/\{[\s\S]*?"pass"\s*:\s*(true|false)[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        pass: Boolean(parsed.pass),
        rationale: String(parsed.rationale || 'No rationale provided'),
      };
    } catch {
      // Fall through to heuristic
    }
  }

  // Heuristic fallback: look for pass/fail keywords
  const lower = response.toLowerCase();
  const pass = lower.includes('"pass": true') || lower.includes('"pass":true');
  return {
    pass,
    rationale: response.slice(0, 500),
  };
}

/**
 * Escape a string for use in a RegExp.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
