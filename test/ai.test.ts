import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateContent } from '../src/ai.js';
import { spawn } from 'child_process';
import { loadConfig } from '../src/utils/config.js';

vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

vi.mock('../src/utils/config.js', () => ({
  loadConfig: vi.fn()
}));

describe('generateContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({
      ai: {
        provider: 'gemini',
        model: 'gemini-test-model'
      }
    });
  });

  const createMockProcess = (stdoutData: string, stderrData: string, exitCode: number) => {
    const mockProcess: any = {
      stdin: {
        write: vi.fn(),
        end: vi.fn()
      },
      stdout: {
        on: vi.fn((event, cb) => {
          if (event === 'data' && stdoutData) {
            cb(Buffer.from(stdoutData));
          }
        })
      },
      stderr: {
        on: vi.fn((event, cb) => {
          if (event === 'data' && stderrData) {
            cb(Buffer.from(stderrData));
          }
        })
      },
      on: vi.fn((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(exitCode), 0);
        }
      })
    };
    return mockProcess;
  };

  it('Gemini CLIを呼び出し、JSONの出力をパースして返すこと', async () => {
    const mockProcess = createMockProcess('{"response": "Valid JSON Response", "usage": {"totalTokens": 100}}', '', 0);
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    const result = await generateContent('Test prompt');

    expect(spawn).toHaveBeenCalledWith('gemini', ['-o', 'json', '-m', 'gemini-test-model']);
    expect(mockProcess.stdin.write).toHaveBeenCalledWith('Test prompt');
    expect(result.text).toBe('Valid JSON Response');
    expect(result.meta.provider).toBe('gemini');
    expect(result.meta.usage.totalTokens).toBe(100);
  });

  it('システムプロンプトがある場合、プロンプトの前に結合されること', async () => {
    const mockProcess = createMockProcess('{"response": "Response"}', '', 0);
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    await generateContent('Test prompt', undefined, 'System instruction');

    expect(mockProcess.stdin.write).toHaveBeenCalledWith('System instruction\n\n---\n\nTest prompt');
  });

  it('Codex CLIが指定された場合、正しい引数で呼び出し、JSONLをパースすること', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      ai: { provider: 'codex', model: 'codex-model' }
    });

    const codexOutput = `{"type": "turn.completed", "usage": {"tokens": 50}}\n{"type": "item.completed", "item": {"type": "agent_message", "text": "Codex Response"}}`;
    const mockProcess = createMockProcess(codexOutput, '', 0);
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    const result = await generateContent('Test prompt');

    expect(spawn).toHaveBeenCalledWith('codex', ['exec', '-', '--json', '--dangerously-bypass-approvals-and-sandbox', '-m', 'codex-model']);
    expect(result.text).toBe('Codex Response');
    expect(result.meta.provider).toBe('codex');
    expect(result.meta.usage.tokens).toBe(50);
  });

  it('プロセスがゼロ以外の終了コードを返した場合、エラーを投げること', async () => {
    const mockProcess = createMockProcess('', 'Error occurred in CLI', 1);
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    await expect(generateContent('Test prompt')).rejects.toThrow('gemini CLI failed with exit code 1\nstderr: Error occurred in CLI');
  });

  it('プロセスの起動自体に失敗（errorイベント）した場合、エラーを投げること', async () => {
    const mockProcess: any = {
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'error') {
          setTimeout(() => cb(new Error('Spawn ENOENT')), 0);
        }
      })
    };
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    await expect(generateContent('Test prompt')).rejects.toThrow('gemini CLI execution failed: Spawn ENOENT');
  });

  it('JSONのパースに失敗した場合は、生の出力をフォールバックとして返すこと', async () => {
    // 中途半端なJSONやJSONを含まない文字列
    const rawOutput = 'This is just raw text response without JSON format';
    const mockProcess = createMockProcess(rawOutput, '', 0);
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    const result = await generateContent('Test prompt');

    expect(result.text).toBe('This is just raw text response without JSON format');
  });
});
