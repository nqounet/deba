import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import EventEmitter from 'events';

// モックを最優先で定義 (トップレベル定数への対策)
vi.mock('../src/utils/git-base', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo'),
  getMainRepoRoot: vi.fn(() => '/mock/main'),
  cleanWorktrees: vi.fn()
}));
vi.mock('../src/utils/git-worktree', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo'),
  getMainRepoRoot: vi.fn(() => '/mock/main'),
  cleanWorktrees: vi.fn()
}));
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user'),
  default: { homedir: vi.fn(() => '/home/user') }
}));
vi.mock('fs/promises');
vi.mock('child_process', () => {
  return {
    spawn: vi.fn()
  };
});
vi.mock('../src/utils/clean');
vi.mock('../src/skills');
vi.mock('../src/growthLog');
vi.mock('../src/ai');
vi.mock('../src/utils/config');

// モジュールを後からインポート
import * as maintenance from '../src/commands/maintenance';
import * as configUtils from '../src/utils/config';
import * as cleanUtils from '../src/utils/clean';
import * as skills from '../src/skills';
import * as growthLog from '../src/growthLog';
import * as ai from '../src/ai';
import { cleanWorktrees } from '../src/utils/git-worktree';

describe('commands/maintenance module', () => {
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue({
      ai: {
        planning: { provider: 'gemini', model: 'planning' },
        execution: { provider: 'gemini', model: 'execution' }
      }
    } as any);
  });

  it('installCommand: セットアップを順次実行すること', async () => {
    await maintenance.installCommand();
    expect(configUtils.initConfig).toHaveBeenCalled();
  });

  it('setupDirectoriesCommand: 必要なディレクトリを作成すること', async () => {
    await maintenance.setupDirectoriesCommand();
    expect(fs.mkdir).toHaveBeenCalled();
  });

  it('setupSkillCommand: skills/deba/SKILL.md をコピーすること', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    await maintenance.setupSkillCommand();
    expect(fs.copyFile).toHaveBeenCalled();
  });

  describe('setupSKRCommand', () => {
    it('SKRが未インストールの場合はgit cloneを実行すること', async () => {
      const error = new Error('ENOENT') as any;
      error.code = 'ENOENT';
      vi.mocked(fs.access).mockRejectedValueOnce(error);
      
      const mockSpawnEmitter = new EventEmitter();
      vi.mocked(spawn).mockReturnValue(mockSpawnEmitter as any);
      
      const setupPromise = maintenance.setupSKRCommand();
      // Ensure the spawn logic is executed before emitting the event
      await new Promise(resolve => setImmediate(resolve));
      mockSpawnEmitter.emit('close', 0);
      await setupPromise;
      
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('.agents/skills'), { recursive: true });
      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['clone', 'https://github.com/nqounet/semantic-knowledge-repository.git'],
        expect.any(Object)
      );
    });

    it('SKRがインストール済みの場合は何もしないこと', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      
      await maintenance.setupSKRCommand();
      
      expect(spawn).not.toHaveBeenCalled();
    });

    it('アクセスエラーがENOENT以外の場合はエラーを表示して終了すること', async () => {
      const error = new Error('EACCES') as any;
      error.code = 'EACCES';
      vi.mocked(fs.access).mockRejectedValueOnce(error);
      
      await maintenance.setupSKRCommand();
      
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  it('setupConfigCommand: configを初期化すること', async () => {
    await maintenance.setupConfigCommand();
    expect(configUtils.initConfig).toHaveBeenCalled();
  });

  it('cleanCommand: worktreeとsnapshotを掃除すること', async () => {
    await maintenance.cleanCommand({ days: '7' });
    expect(cleanWorktrees).toHaveBeenCalled();
    expect(cleanUtils.cleanSnapshots).toHaveBeenCalledWith(7);
  });

  it('skillsCommand: スキル一覧を表示すること', async () => {
    vi.mocked(skills.listSkills).mockResolvedValue({ count: 1, display: 'Skill list' });
    await maintenance.skillsCommand();
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Skill list'));
  });

  it('skillsPromoteCommand: スキルを昇格すること', async () => {
    await maintenance.skillsPromoteCommand('rule', { project: 'p' });
    expect(skills.promoteToSkill).toHaveBeenCalledWith('rule', 'p');
  });

  describe('promoteLearningsCommand', () => {
    it('提案や学びがある場合、--yes オプションで自動承認して処理すること', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['prop1.md'] as any);
      vi.mocked(fs.readFile).mockResolvedValue('proposal content');
      vi.mocked(growthLog.getPendingLearnings).mockResolvedValue([{
        summary: 'learning', filepath: 'log.md', generalizability: 'high', relatedSkills: 'new'
      }] as any);

      await maintenance.promoteLearningsCommand({ yes: true });

      expect(fs.rename).toHaveBeenCalled(); 
      expect(skills.promoteToSkill).toHaveBeenCalled(); 
      expect(growthLog.markAsApproved).toHaveBeenCalled();
    });

    it('対象がない場合、メッセージを表示すること', async () => {
        vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(growthLog.getPendingLearnings).mockResolvedValue([]);
        await maintenance.promoteLearningsCommand({});
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('承認待ちの学びはありません'));
    });
  });

  it('consolidateSkillsCommand: スキルファイルをLLMで統合すること', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['skill.md'] as any);
    vi.mocked(fs.readFile).mockResolvedValue('old content');
    vi.mocked(ai.generateContent).mockResolvedValue({ text: 'new content', meta: {} } as any);

    await maintenance.consolidateSkillsCommand();

    expect(ai.generateContent).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('skill.md'), 'new content');
  });
});
