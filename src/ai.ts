import { spawn } from 'child_process';
import { loadConfig } from './utils/config.js';
import { spinner } from './utils/spinner.js';

export class ChatSession {
  private child: any;
  private provider: string;
  private model: string;
  private systemInstruction?: string;

  constructor(provider: string, model: string, systemInstruction?: string) {
    this.provider = provider;
    this.model = model;
    this.systemInstruction = systemInstruction;
  }

  async start(): Promise<void> {
    const args: string[] = ['chat', '-o', 'json'];
    if (this.model) {
      args.push('-m', this.model);
    }
    if (this.systemInstruction) {
      args.push('-s', this.systemInstruction);
    }

    this.child = spawn('gemini', args);

    // エラーハンドリング
    this.child.stderr.on('data', (data: any) => {
      console.error(`[ChatSession stderr] ${data}`);
    });

    this.child.on('error', (err: any) => {
      console.error(`[ChatSession error] ${err.message}`);
    });

    this.child.on('close', (code: number) => {
      if (code !== 0 && code !== null) {
        console.warn(`[ChatSession] Process exited with code ${code}`);
      }
    });

    // 初期化待ち (オプション)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async sendMessage(prompt: string): Promise<{ text: string; meta: any }> {
    if (!this.child) throw new Error('ChatSession not started');

    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      let stdout = '';
      const onData = (data: any) => {
        stdout += data;
        // JSONの終端を検知
        if (stdout.includes('}')) {
          try {
            // パースを試みる (不完全な場合は継続)
            const jsonStart = stdout.indexOf('{');
            const jsonEnd = stdout.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
              const jsonText = stdout.substring(jsonStart, jsonEnd + 1);
              const jsonOutput = JSON.parse(jsonText);
              
              this.child.stdout.off('data', onData);
              const endTime = Date.now();
              resolve({
                text: (jsonOutput.response || jsonOutput.text || '').trim(),
                meta: {
                  ...jsonOutput,
                  duration_ms: endTime - startTime,
                }
              });
            }
          } catch (e) {
            // まだ不完全なJSON
          }
        }
      };

      this.child.stdout.on('data', onData);
      this.child.stdin.write(prompt + '\n');
    });
  }

  async close(): Promise<void> {
    if (this.child) {
      this.child.stdin.end();
      this.child.kill();
      this.child = null;
    }
  }
}

/**
 * 新しい ChatSession を開始する
 */
export async function startChatSession(model?: string, systemInstruction?: string): Promise<ChatSession> {
  const config = await loadConfig();
  const provider = config.ai.provider || 'gemini';
  const selectedModel = model || config.ai.model;

  const session = new ChatSession(provider, selectedModel, systemInstruction);
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

  // システムプロンプトがある場合はプロンプトに前置する
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
    args = [
      'exec',
      '-', // stdinから読み込む
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
    ];
    if (selectedModel) {
      args.push('-m', selectedModel);
    }
  }

  const rawOutput = await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    // プロンプトを stdin に書き込む
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
        reject(
          new Error(`${command} CLI failed with exit code ${code}\nstderr: ${stderr}`)
        );
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
    // JSON形式の出力をパースして、実際の回答テキストを取り出す
    try {
      // 最初の '{' から最後の '}' までを抽出してパースを試みる
      const jsonStart = rawOutput.indexOf('{');
      const jsonEnd = rawOutput.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonText = rawOutput.substring(jsonStart, jsonEnd + 1);
        const jsonOutput = JSON.parse(jsonText);
        text = jsonOutput.response || jsonOutput.text || ''; // response または text フィールドを参照
        cliMeta = jsonOutput; // トークン数などのメタ情報を保持
      } else {
        text = rawOutput.trim();
      }
    } catch (e) {
      // 万が一JSONパースに失敗した場合は、生の出力をそのまま使う（フォールバック）
      text = rawOutput.trim();
    }
  } else if (provider === 'codex') {
    // JSONL形式の出力をパース
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

  // Usage ログを記録
  const { usageTracker } = await import('./utils/usage.js');
  usageTracker.recordCall({
    model: selectedModel || 'unknown',
    provider,
    duration_ms: endTime - startTime,
    prompt_tokens: cliMeta.usage?.prompt_tokens || cliMeta.usage?.total_tokens, // metaの内容に依存
    completion_tokens: cliMeta.usage?.completion_tokens,
  });

  return { text: text.trim(), meta };
}
