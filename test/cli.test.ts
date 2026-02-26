import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';

// 各コマンド関数のモック化
vi.mock('../src/commands/plan', () => ({ chatCommand: vi.fn(), planCommand: vi.fn() }));
vi.mock('../src/commands/run', () => ({ runCommand: vi.fn(), runPlanCommand: vi.fn() }));
vi.mock('../src/commands/review', () => ({ reviewCommand: vi.fn() }));
vi.mock('../src/commands/maintenance', () => ({ 
  cleanCommand: vi.fn(), 
  skillsCommand: vi.fn(), 
  skillsPromoteCommand: vi.fn(), 
  promoteLearningsCommand: vi.fn(), 
  consolidateSkillsCommand: vi.fn(), 
  setupSkillCommand: vi.fn(), 
  setupConfigCommand: vi.fn(), 
  installCommand: vi.fn() 
}));
vi.mock('../src/commands/worktree', () => ({ worktreeAddCommand: vi.fn() }));
vi.mock('../src/commands/worker', () => ({ workerCommand: vi.fn() }));
vi.mock('../src/commands/utils', () => ({ validateCommand: vi.fn(), executeCommand: vi.fn() }));

// commander モックの作成（メソッドチェーン対応）
const mockProgram = {
  name: vi.fn().mockReturnThis(),
  description: vi.fn().mockReturnThis(),
  version: vi.fn().mockReturnThis(),
  command: vi.fn().mockReturnThis(),
  action: vi.fn().mockReturnThis(),
  option: vi.fn().mockReturnThis(),
  argument: vi.fn().mockReturnThis(),
  addCommand: vi.fn().mockReturnThis(),
  allowUnknownOption: vi.fn().mockReturnThis(),
  requiredOption: vi.fn().mockReturnThis(),
  parse: vi.fn().mockReturnThis(),
};

vi.mock('commander', () => {
  return {
    Command: vi.fn(() => mockProgram)
  };
});

describe('CLI Entry Point', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('package.jsonから正しいバージョンを読み込んで設定していること', async () => {
    await import('../src/cli');
    const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
    expect(mockProgram.version).toHaveBeenCalledWith(pkg.version);
  });

  it('主要なコマンドが正しく登録されていること', async () => {
    await import('../src/cli');
    
    // コマンド名が呼ばれていることを確認
    const commands = ['chat', 'plan', 'worker', 'worktree-add', 'validate', 'execute', 'run', 'run-plan', 'review', 'maintenance'];
    commands.forEach(cmd => {
      expect(mockProgram.command).toHaveBeenCalledWith(cmd);
    });

    // 各コマンドのアクション関数が呼ばれていることを確認（モック関数自体が登録されているか）
    expect(mockProgram.action).toHaveBeenCalled();
  });

  it('maintenance サブコマンドが正しく登録されていること', async () => {
    await import('../src/cli');
    
    const subCommands = ['clean', 'skills', 'skills-promote', 'promote', 'consolidate-skills', 'setup-skill', 'setup-config'];
    subCommands.forEach(cmd => {
      expect(mockProgram.command).toHaveBeenCalledWith(cmd);
    });
  });
});
