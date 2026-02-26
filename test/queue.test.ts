import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  initQueueDirs,
  getQueueDirPath,
  moveTask,
  enqueueStep,
  moveAllSteps
} from '../src/utils/queue';

// モックの設定
vi.mock('fs/promises');
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: () => '/mock/repo/root'
}));

describe('queue utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getQueueDirPath', () => {
    it('各ステータスの正しいパスを返すこと', () => {
      expect(getQueueDirPath('todo')).toBe(path.join('/mock/repo/root/brain/queue', 'todo'));
      expect(getQueueDirPath('doing')).toBe(path.join('/mock/repo/root/brain/queue', 'doing'));
      expect(getQueueDirPath('done')).toBe(path.join('/mock/repo/root/brain/queue', 'done'));
      expect(getQueueDirPath('failed')).toBe(path.join('/mock/repo/root/brain/queue', 'failed'));
    });
  });

  describe('initQueueDirs', () => {
    it('必要な4つのディレクトリを再帰的に作成すること', async () => {
      await initQueueDirs();
      
      expect(fs.mkdir).toHaveBeenCalledTimes(4);
      expect(fs.mkdir).toHaveBeenCalledWith(path.join('/mock/repo/root/brain/queue/todo'), { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(path.join('/mock/repo/root/brain/queue/doing'), { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(path.join('/mock/repo/root/brain/queue/done'), { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(path.join('/mock/repo/root/brain/queue/failed'), { recursive: true });
    });

    it('mkdirが失敗した場合はエラーを投げること', async () => {
      vi.mocked(fs.mkdir).mockRejectedValueOnce(new Error('Permission denied'));
      await expect(initQueueDirs()).rejects.toThrow('Permission denied');
    });
  });

  describe('moveTask', () => {
    it('ファイルを指定したステータスのディレクトリに移動すること', async () => {
      const filename = 'task_1.json';
      await moveTask(filename, 'todo', 'doing');

      const oldPath = path.join('/mock/repo/root/brain/queue/todo', filename);
      const newPath = path.join('/mock/repo/root/brain/queue/doing', filename);
      
      expect(fs.rename).toHaveBeenCalledTimes(1);
      expect(fs.rename).toHaveBeenCalledWith(oldPath, newPath);
    });

    it('renameが失敗した場合はカスタムエラーメッセージでエラーを投げること', async () => {
      vi.mocked(fs.rename).mockRejectedValueOnce(new Error('ENOENT'));
      await expect(moveTask('task_1.json', 'todo', 'doing'))
        .rejects.toThrow('タスクの移動に失敗しました (todo -> doing): task_1.json - ENOENT');
    });
  });

  describe('enqueueStep', () => {
    it('ステップ情報をJSONとして保存し、ファイル名を返すこと', async () => {
      const mockDate = new Date('2026-02-26T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      const step = { id: '1', description: 'Test step' };
      const filename = await enqueueStep('task_123', step);

      expect(filename).toBe('task_123_step_1.json');

      const expectedPath = path.join('/mock/repo/root/brain/queue/todo', filename);
      const expectedData = {
        taskId: 'task_123',
        id: '1',
        description: 'Test step',
        enqueuedAt: '2026-02-26T12:00:00.000Z'
      };

      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledWith(expectedPath, JSON.stringify(expectedData, null, 2), 'utf-8');
    });

    it('writeFileが失敗した場合はカスタムエラーメッセージでエラーを投げること', async () => {
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('Disk full'));
      const step = { id: '2', description: 'Failing step' };
      
      await expect(enqueueStep('task_456', step))
        .rejects.toThrow('タスクのエンキューに失敗しました: task_456_step_2.json - Disk full');
    });
  });

  describe('moveAllSteps', () => {
    it('指定したtaskIdから始まるすべてのファイルを新しいステータスへ移動すること', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'task_123_step_1.json' as any,
        'task_123_step_2.json' as any,
        'task_456_step_1.json' as any // 別のtaskId
      ]);

      await moveAllSteps('task_123', 'todo', 'failed');

      expect(fs.readdir).toHaveBeenCalledTimes(1);
      expect(fs.readdir).toHaveBeenCalledWith(path.join('/mock/repo/root/brain/queue/todo'));

      expect(fs.rename).toHaveBeenCalledTimes(2);
      expect(fs.rename).toHaveBeenCalledWith(
        path.join('/mock/repo/root/brain/queue/todo', 'task_123_step_1.json'),
        path.join('/mock/repo/root/brain/queue/failed', 'task_123_step_1.json')
      );
      expect(fs.rename).toHaveBeenCalledWith(
        path.join('/mock/repo/root/brain/queue/todo', 'task_123_step_2.json'),
        path.join('/mock/repo/root/brain/queue/failed', 'task_123_step_2.json')
      );
    });
  });
});
