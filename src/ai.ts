import { spawn } from 'child_process';
import { loadConfig } from './utils/config.js';
import { spinner } from './utils/spinner.js';
import { isWorkerRunning } from './utils/workerProcess.js';
import { getQueueDirPath, initQueueDirs } from './utils/queue.js';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { watch } from 'fs';
import * as path from 'path';

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

  // レスポンスファイルが生成されるのを待機
  return new Promise((resolve, reject) => {
    let isResolved = false;

    // TODO: 定期的なタイムアウト処理を入れる場合はここで設定
    const watcher = watch(responseDir, async (eventType, filename) => {
      if (filename === responseFilename && !isResolved) {
        isResolved = true;
        watcher.close();
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
      }
    });

    // watch 開始前に既にファイルが存在していた場合 (ワーカーの処理が早かった場合)
    fs.access(responsePath).then(async () => {
       if (!isResolved) {
         isResolved = true;
         watcher.close();
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
       }
    }).catch(() => { /* not exists yet, watch will handle it */ });
  });
}

export async function directGenerateContent(
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
  let args: string[] = [];

  if (provider === 'gemini') {
    command = 'gemini';
    args = ['-o', 'json'];
  } else if (provider === 'codex') {
    command = 'codex';
    args = ['exec', '-', '--json', '--dangerously-bypass-approvals-and-sandbox'];
  } else if (provider === 'copilot') {
    command = 'copilot';
    args = [];
  }

  if (selectedModel) {
    args.push('-m', selectedModel);
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

  if (provider === 'gemini' || provider === 'copilot') {
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
