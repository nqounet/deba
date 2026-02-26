import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTests, executeStep, executeBatches } from '../src/runner';
import * as ai from '../src/ai';
import * as prompt from '../src/prompt';
import * as snapshot from '../src/snapshot';
import * as config from '../src/utils/config';
import { exec, execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

// child_process のモック
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn()
}));

// fs/promises のモック
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn()
}));

// 内部モジュールのモック
vi.mock('../src/ai');
vi.mock('../src/prompt');
vi.mock('../src/snapshot');
vi.mock('../src/utils/config');
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: () => '/mock/repo/root',
  getMainRepoRoot: () => '/mock/repo/main'
}));

describe('runner module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // 共通のモック戻り値を設定
    vi.mocked(config.loadConfig).mockResolvedValue({
      ai: { flash_model: 'gemini-test-flash' }
    });
    vi.mocked(prompt.buildPhaseBPrompt).mockReturnValue('Mock Prompt');
    vi.mocked(snapshot.saveSnapshot).mockResolvedValue(undefined);
  });

  describe('executeTests', () => {
    it('テストコマンドが成功した場合、exit code 0 を返すこと', async () => {
      vi.mocked(exec).mockImplementation((cmd, options, cb: any) => {
        cb(null, 'test passed', '');
        return {} as any;
      });

      const result = await executeTests('/mock/dir', 'npm test');
      expect(result).toEqual({ stdout: 'test passed', stderr: '', code: 0 });
      expect(exec).toHaveBeenCalledWith('npm test', { cwd: '/mock/dir' }, expect.any(Function));
    });

    it('テストコマンドが失敗した場合、その exit code を返すこと', async () => {
      vi.mocked(exec).mockImplementation((cmd, options, cb: any) => {
        cb({ code: 1 }, 'test output', 'test error');
        return {} as any;
      });

      const result = await executeTests(undefined, 'npm test test/spec.ts');
      expect(result).toEqual({ stdout: 'test output', stderr: 'test error', code: 1 });
    });
  });

  describe('executeStep', () => {
    it('AIがコードブロックを返した場合、対象ファイルに書き込んで text を返すこと', async () => {
      vi.mocked(ai.generateContent).mockResolvedValue({
        text: '```typescript\nconsole.log("hello");\n```',
        meta: {}
      } as any);

      const step = {
        id: 1,
        description: 'Test step',
        target_files: ['src/test.ts']
      };

      const result = await executeStep(step, [], 'task_123', '/mock/dir');

      expect(result.text).toBe('console.log("hello");');
      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining(path.normalize('src/test.ts')), 'console.log("hello");', 'utf-8');
      expect(execSync).toHaveBeenCalledWith('git add src/test.ts', { cwd: '/mock/dir' });
    });

    it('AIが AMBIGUITY を返した場合、ファイル書き込みをスキップすること', async () => {
      vi.mocked(ai.generateContent).mockResolvedValue({
        text: 'AMBIGUITY: I need more details.',
        meta: {}
      } as any);

      const step = { id: 2, description: 'Ambiguous step', target_files: ['src/test.ts'] };
      
      const result = await executeStep(step, [], 'task_123', '/mock/dir');

      expect(result.text).toBe('AMBIGUITY: I need more details.');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('ステップ固有のテストが失敗した場合、自己修復リトライを実行すること', async () => {
      // 1回目のAI応答
      vi.mocked(ai.generateContent).mockResolvedValueOnce({
        text: '```\nbad code\n```',
        meta: {}
      } as any);
      // 2回目のAI応答（修復後）
      vi.mocked(ai.generateContent).mockResolvedValueOnce({
        text: '```\ngood code\n```',
        meta: {}
      } as any);

      // 1回目のテストは失敗、2回目のテストは成功
      vi.mocked(exec).mockImplementationOnce((cmd, options, cb: any) => {
        cb({ code: 1 }, '', 'error msg');
        return {} as any;
      }).mockImplementationOnce((cmd, options, cb: any) => {
        cb(null, 'pass', '');
        return {} as any;
      });

      const step = {
        id: 3,
        description: 'Test retry',
        target_files: ['src/test.ts'],
        test_command: 'npm run test:specific'
      };

      const result = await executeStep(step, [], 'task_123', '/mock/dir');

      // リトライを経て最終的なコードが返る
      expect(result.text).toBe('good code');
      expect(ai.generateContent).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeBatches', () => {
    it('バッチ内のステップを実行し、全体テストを通過すること', async () => {
      vi.mocked(ai.generateContent).mockResolvedValue({ text: 'code', meta: {} } as any);
      // package.json が存在することをシミュレート
      vi.mocked(fs.access).mockResolvedValue(undefined);
      // 全体テストが成功する
      vi.mocked(exec).mockImplementation((cmd, options, cb: any) => {
        cb(null, 'all passed', '');
        return {} as any;
      });

      const batches = [
        { steps: [{ id: 1, description: 's1', target_files: [] }] }
      ];

      await expect(executeBatches(batches, [], 'task_123', '/mock/dir')).resolves.toBeUndefined();
      
      expect(ai.generateContent).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledTimes(1); // regression test
    });

    it('全体テストが修復後も失敗し続ける場合、エラーを投げること', async () => {
      vi.mocked(ai.generateContent).mockResolvedValue({ text: 'code', meta: {} } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      
      // 常にテストが失敗する
      vi.mocked(exec).mockImplementation((cmd, options, cb: any) => {
        cb({ code: 1 }, '', 'regression error');
        return {} as any;
      });

      const batches = [
        { steps: [{ id: 1, description: 's1', target_files: [] }] }
      ];

      await expect(executeBatches(batches, [], 'task_123', '/mock/dir'))
        .rejects.toThrow('Regression test failed after repair. Details:\nregression error');
      
      // 初回実行 + リトライ実行
      expect(ai.generateContent).toHaveBeenCalledTimes(2);
      // 初回テスト + リトライ後テスト
      expect(exec).toHaveBeenCalledTimes(2);
    });
  });
});
