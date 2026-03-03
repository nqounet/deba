import { spawn } from 'child_process';
import { loadConfig } from './utils/config.js';
import { spinner } from './utils/spinner.js';
import { isWorkerRunning } from './utils/workerProcess.js';
import { getQueueDirPath, initQueueDirs } from './utils/queue.js';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { watch } from 'fs';
import * as path from 'path';

const MAX_HISTORY_ENTRIES = 40;

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

  /**
   * 履歴がMAX_HISTORY_ENTRIESを超えた場合、古いエントリを削除して制限内に収める
   */
  private trimHistory(): void {
    if (this.history.length > MAX_HISTORY_ENTRIES) {
      const overflow = this.history.length - MAX_HISTORY_ENTRIES;
      this.history = this.history.slice(overflow);
      console.log(`[ChatSession] Trimmed ${overflow} old history entries (limit: ${MAX_HISTORY_ENTRIES})`);
    }
  }

  async sendMessage(prompt: string): Promise<{ text: string; meta: any }> {
    this.history.push({ role: 'user', content: prompt });
    this.trimHistory();

    const combinedPrompt = this.history
      .map(h => `${h.role.toUpperCase()}: ${h.content}`)
      .join('\n\n---\n\n');

    // ChatSession はワーカー内で動くため、直接生成関数を呼ぶ
    const { text, meta } = await directGenerateContent(
      combinedPrompt,
      this.model,
      this.systemInstruction,
      { silent: true }
    );

    this.history.push({ role: 'model', content: text });
    return { text, meta };
  }

  getHistoryLength(): number {
    return this.history.length;
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
  // ワーカープロセス以外からの呼び出しは、キュー経由でワーカーに依頼する
  if (process.env.DEBA_IS_WORKER !== '1') {
    return await enqueueRequestAndWait(prompt, model, systemInstruction, options);
  }
  return await directGenerateContent(prompt, model, systemInstruction, options);
}

async function enqueueRequestAndWait(
  prompt: string,
  model?: string,
  systemInstruction?: string,
  options: { silent?: boolean } = {}
): Promise<{ text: string; meta: any }> {
  await initQueueDirs();
  if (!(await isWorkerRunning())) {
    throw new Error('Deba Eternal Worker is not running.\n' +
      'Please start it by running `deba worker` in a separate terminal.\n' +
      'This worker maintains context sessions and handles asynchronous execution.');
  }

  const requestId = crypto.randomUUID();
  const requestFilename = `req_${requestId}.json`;
  const responseFilename = `res_${requestId}.json`;

  const requestPath = path.join(getQueueDirPath('requests'), requestFilename);
  const responseDir = getQueueDirPath('responses');
  const responsePath = path.join(responseDir, responseFilename);

  const requestData = {
    id: requestId,
    type: 'generateContent',
    prompt,
    model,
    systemInstruction,
    options,
    createdAt: new Date().toISOString()
  };

  if (!options.silent) {
    spinner.start(`Waiting for worker... (reqId: ${requestId.substring(0, 8)})`);
  }

  // ワーカーへリクエストを書き込む
  await fs.writeFile(requestPath, JSON.stringify(requestData, null, 2), 'utf-8');

  const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000; // 5分

  // レスポンスファイルが生成されるのを待機
  return new Promise((resolve, reject) => {
    let isResolved = false;

    const cleanup = () => {
      isResolved = true;
      watcher.close();
      clearTimeout(timeoutId);
    };

    const handleResponse = async () => {
      try {
        const respData = JSON.parse(await fs.readFile(responsePath, 'utf-8'));
        if (respData.error) {
          if (!options.silent) spinner.fail(`Worker Error: ${respData.error}`);
          reject(new Error(respData.error));
        } else {
          if (!options.silent) spinner.succeed(`Received response from worker.`);
          resolve({ text: respData.text, meta: respData.meta });
        }
      } catch (err: any) {
        reject(new Error(`Failed to parse worker response: ${err.message}`));
      }
    };

    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        cleanup();
        if (!options.silent) spinner.fail(`Worker response timed out after ${RESPONSE_TIMEOUT_MS / 1000}s`);
        reject(new Error(`Worker response timed out after ${RESPONSE_TIMEOUT_MS / 1000} seconds. The worker may be overloaded or not running.`));
      }
    }, RESPONSE_TIMEOUT_MS);

    const watcher = watch(responseDir, async (eventType, filename) => {
      if (filename === responseFilename && !isResolved) {
        cleanup();
        await handleResponse();
      }
    });

    // watch 開始前に既にファイルが存在していた場合 (ワーカーの処理が早かった場合)
    fs.access(responsePath).then(async () => {
       if (!isResolved) {
         cleanup();
         await handleResponse();
       }
    }).catch(() => { /* not exists yet, watch will handle it */ });
  });
}

/**
 * CLI 実行の共通ユーティリティ
 */
async function runCliCommand(
  command: string,
  args: string[],
  input: string,
  options: { silent?: boolean } = {}
): Promise<string> {
  console.log(`[AI] Executing: ${command} ${args.join(' ')}`);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdin.write(input);
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
      resolve(stdout);
    });

    child.on('error', (err) => {
      reject(new Error(`${command} CLI execution failed: ${err.message}`));
    });
  });
}

/**
 * デコード処理の共通化
 */
const Decoders = {
  json(rawOutput: string) {
    try {
      const jsonStart = rawOutput.indexOf('{');
      const jsonEnd = rawOutput.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonText = rawOutput.substring(jsonStart, jsonEnd + 1);
        const jsonOutput = JSON.parse(jsonText);
        return {
          text: jsonOutput.response || jsonOutput.text || '',
          meta: jsonOutput
        };
      }
    } catch (e: any) {
      console.warn(`[AI] JSON decode warning: ${e.message}`);
    }
    return { text: rawOutput.trim() };
  },
  jsonl(rawOutput: string) {
    let text = '';
    const cliMeta: any = { usage: {} };
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
    } catch (e: any) {
      console.warn(`[AI] JSONL decode warning: ${e.message}`);
    }
    return { text: text || rawOutput.trim(), meta: cliMeta };
  }
};

/**
 * AI プロバイダーの抽象インターフェース
 */
interface AiProviderHandler {
  getDefaultModel(config: any): string | undefined;
  getCommandArgs(model?: string): { command: string; args: string[] };
  parseOutput(rawOutput: string): { text: string; meta?: any };
}

/**
 * Gemini プロバイダーの実装
 */
const GeminiHandler: AiProviderHandler = {
  getDefaultModel(config) {
    return config.ai.model || 'gemini-2.0-flash-exp';
  },
  getCommandArgs(model) {
    const args = ['-o', 'json'];
    if (model) args.push('-m', model);
    return { command: 'gemini', args };
  },
  parseOutput: Decoders.json
};

/**
 * Codex プロバイダーの実装
 */
const CodexHandler: AiProviderHandler = {
  getDefaultModel(config) {
    return config.ai.model;
  },
  getCommandArgs(model) {
    const args = ['exec', '-', '--json', '--dangerously-bypass-approvals-and-sandbox'];
    if (model) args.push('-m', model);
    return { command: 'codex', args };
  },
  parseOutput: Decoders.jsonl
};

/**
 * Copilot プロバイダーの実装
 */
const CopilotHandler: AiProviderHandler = {
  getDefaultModel(config) {
    return config.ai.model;
  },
  getCommandArgs(model) {
    const args: string[] = [];
    if (model) args.push('--model', model);
    return { command: 'copilot', args };
  },
  parseOutput: Decoders.json
};

const PROVIDER_HANDLERS: Record<string, AiProviderHandler> = {
  gemini: GeminiHandler,
  codex: CodexHandler,
  copilot: CopilotHandler
};

export async function directGenerateContent(
  prompt: string,
  model?: string,
  systemInstruction?: string,
  options: { silent?: boolean } = {}
): Promise<{ text: string; meta: any }> {
  const config = await loadConfig();
  const providerName = config.ai.provider || 'gemini';
  console.log(`[AI] Using provider: ${providerName}`);
  const handler = PROVIDER_HANDLERS[providerName];

  if (!handler) {
    throw new Error(`Unsupported provider: ${providerName}`);
  }

  const selectedModel = model || handler.getDefaultModel(config);

  if (!options.silent) {
    spinner.start(`Requesting ${providerName}${selectedModel ? ` (${selectedModel})` : ''}...`);
  }

  const startTime = Date.now();
  const fullPrompt = systemInstruction ? `${systemInstruction}\n\n---\n\n${prompt}` : prompt;

  const { command, args } = handler.getCommandArgs(selectedModel);
  const rawOutput = await runCliCommand(command, args, fullPrompt, options);
  
  const { text, meta: cliMeta } = handler.parseOutput(rawOutput);
  
  if (!options.silent) {
    spinner.succeed(`Received response from ${providerName}`);
  }

  const endTime = Date.now();
  const meta = {
    timestamp: new Date().toISOString(),
    provider: providerName,
    model: selectedModel,
    duration_ms: endTime - startTime,
    cli_used: true,
    ...cliMeta,
  };

  const { usageTracker } = await import('./utils/usage.js');
  usageTracker.recordCall({
    model: selectedModel || 'unknown',
    provider: providerName,
    duration_ms: endTime - startTime,
    prompt_tokens: cliMeta?.usage?.prompt_tokens || cliMeta?.usage?.total_tokens,
    completion_tokens: cliMeta?.usage?.completion_tokens,
  });

  return { text: text.trim(), meta };
}
