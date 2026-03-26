/**
 * LLM provider abstraction for eval judges.
 *
 * Supports OpenAI and Anthropic models. The judge model is selected via
 * the EVAL_JUDGE_MODEL env var (default: gpt-5.4-mini).
 *
 * SDK imports are dynamic so the eval suite can run without requiring both
 * openai and @anthropic-ai/sdk to be installed. Clients are lazily cached
 * so they are only created once per provider instance.
 */

export interface LLMProvider {
  complete(system: string, user: string): Promise<string>;
  name: string;
}

export class OpenAIProvider implements LLMProvider {
  name: string;
  private model: string;
  private client: any;

  constructor(model: string = 'gpt-5.4-mini') {
    this.model = model;
    this.name = `openai/${model}`;
  }

  private async getClient(): Promise<any> {
    if (!this.client) {
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI();
    }
    return this.client;
  }

  async complete(system: string, user: string): Promise<string> {
    const client = await this.getClient();
    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: 1024,
    });
    return response.choices[0]?.message?.content || '';
  }
}

export class AnthropicProvider implements LLMProvider {
  name: string;
  private model: string;
  private client: any;

  constructor(model: string = 'claude-sonnet-4-6') {
    this.model = model;
    this.name = `anthropic/${model}`;
  }

  private async getClient(): Promise<any> {
    if (!this.client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic();
    }
    return this.client;
  }

  async complete(system: string, user: string): Promise<string> {
    const client = await this.getClient();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }
}

/**
 * Create a provider based on model name.
 * OpenAI-family prefixes (gpt, o1, o3, o4) route to OpenAI; everything else to Anthropic.
 */
export function createProvider(model?: string): LLMProvider {
  const m = model || process.env.EVAL_JUDGE_MODEL || 'gpt-5.4-mini';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) {
    return new OpenAIProvider(m);
  }
  return new AnthropicProvider(m);
}
