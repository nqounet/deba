import { spawn } from 'child_process';
import { loadConfig } from './utils/config.js';
import { spinner } from './utils/spinner.js';

export class ChatSession {
  private history: { role: string; content: string }[] = [];
  private model: string;
  private systemInstruction?: string;

  constructor(model: string, systemInstruction?: string) {
    this.model = model;
    this.systemInstruction = systemInstruction;
  }

  async start(): Promise<void> {
    console.log(`[ChatSession] Session started with model: ${this.model}`);
  }

  async sendMessage(prompt: string): Promise<{ text: string; meta: any }> {
    this.history.push({ role: 'user', content: prompt });

    const combinedPrompt = this.history
      .map(h => `${h.role.toUpperCase()}: ${h.content}`)
      .join('\n\n---\n\n');

    const { text, meta } = await generateContent(
      combinedPrompt,
      this.model,
      this.systemInstruction,
      { silent: true }
    );

    this.history.push({ role: 'model', content: text });
    return { text, meta };
  }

  async close(): Promise<void> {
    this.history = [];
  }
}

/**
 * 新しい ChatSession を開始する
 */
export async function startChatSession(model?: string, systemInstruction?: string): Promise<ChatSession> {
  const config = await loadConfig();
  const selectedModel = model || config.ai.model || 'gemini-2.0-flash-exp';

  const session = new ChatSession(selectedModel, systemInstruction);
  await session.start();
  return session;
}

export async function generateContent(
  prompt: string,
  model?: string,
  systemInstruction?: string,
  options: { silent?: boolean } = {}
): Promise<{ text: string; meta: any }> {
  const config = await loadConfig();
  const provider = config.ai.provider || 'gemini';
  let selectedModel = model || config.ai.model;

  if (!options.silent) {
    spinner.start(`Requesting ${provider}${selectedModel ? ` (${selectedModel})` : ''}...`);
  }

  const startTime = Date.now();

  const fullPrompt = systemInstruction
    ? `${systemInstruction}\n\n---\n\n${prompt}`
    : prompt;

  let command = 'gemini';
  let args: string[] = ['-o', 'json'];
  if (selectedModel) {
    args.push('-m', selectedModel);
  }

  if (provider === 'codex') {
    command = 'codex';
    args = ['exec', '-', '--json', '--dangerously-bypass-approvals-and-sandbox'];
    if (selectedModel) {
      args.push('-m', selectedModel);
    }
  }

  const rawOutput = await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdin.write(fullPrompt);
    child.stdin.end();

    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      if (code !== 0) {
        if (!options.silent) spinner.fail(`Request failed with exit code ${code}`);
        reject(new Error(`${command} CLI failed with exit code ${code}\nstderr: ${stderr}`));
        return;
      }
      if (!options.silent) spinner.succeed(`Received response from ${provider}`);
      resolve(stdout);
    });

    child.on('error', (err) => {
      reject(new Error(`${command} CLI execution failed: ${err.message}`));
    });
  });

  let text = '';
  let cliMeta: any = {};

  if (provider === 'gemini') {
    try {
      const jsonStart = rawOutput.indexOf('{');
      const jsonEnd = rawOutput.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonText = rawOutput.substring(jsonStart, jsonEnd + 1);
        const jsonOutput = JSON.parse(jsonText);
        text = jsonOutput.response || jsonOutput.text || '';
        cliMeta = jsonOutput;
      } else {
        text = rawOutput.trim();
      }
    } catch (e) {
      text = rawOutput.trim();
    }
  } else if (provider === 'codex') {
    try {
      const lines = rawOutput.trim().split('\n');
      for (const line of lines) {
        const json = JSON.parse(line);
        if (json.type === 'item.completed' && json.item?.type === 'agent_message') {
          text = json.item.text;
        } else if (json.type === 'turn.completed') {
          cliMeta.usage = json.usage;
        }
      }
    } catch (e) {
      text = rawOutput.trim();
    }
  }

  const endTime = Date.now();
  const meta = {
    timestamp: new Date().toISOString(),
    provider,
    model: selectedModel,
    duration_ms: endTime - startTime,
    cli_used: true,
    ...cliMeta,
  };

  const { usageTracker } = await import('./utils/usage.js');
  usageTracker.recordCall({
    model: selectedModel || 'unknown',
    provider,
    duration_ms: endTime - startTime,
    prompt_tokens: cliMeta.usage?.prompt_tokens || cliMeta.usage?.total_tokens,
    completion_tokens: cliMeta.usage?.completion_tokens,
  });

  return { text: text.trim(), meta };
}
