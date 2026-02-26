import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSnapshotsToClean, cleanSnapshots } from '../src/utils/clean';

vi.mock('fs/promises');
vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: vi.fn(() => '/mock/repo')
}));

describe('clean utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getSnapshotsToClean', () => {
    it('指定した日数より古いディレクトリのリストを返すべき', () => {
      const now = new Date('2026-02-25T12:00:00Z').getTime();
      vi.setSystemTime(now);

      const snapshotDirs = [
        { name: 'new', mtime: new Date('2026-02-25T10:00:00Z').getTime() },
        { name: 'old', mtime: new Date('2026-02-10T00:00:00Z').getTime() },
      ];

      const result = getSnapshotsToClean(snapshotDirs, 7);
      expect(result).toEqual(['old']);
    });
  });

  describe('cleanSnapshots', () => {
    it('古いスナップショットを削除すること', async () => {
      const now = new Date('2026-02-25T12:00:00Z').getTime();
      vi.setSystemTime(now);

      const mockEntries = [
        { name: 'new', isDirectory: () => true },
        { name: 'old', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false }
      ];

      vi.mocked(fs.readdir).mockResolvedValue(mockEntries as any);
      vi.mocked(fs.stat).mockImplementation(async (p: any) => {
        if (p.includes('new')) return { mtimeMs: new Date('2026-02-25T10:00:00Z').getTime() } as any;
        if (p.includes('old')) return { mtimeMs: new Date('2026-02-10T00:00:00Z').getTime() } as any;
        return {} as any;
      });
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const spy = vi.spyOn(console, 'log');

      await cleanSnapshots(7);

      expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('old'), expect.any(Object));
      expect(fs.rm).not.toHaveBeenCalledWith(expect.stringContaining('new'), expect.any(Object));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Removed old snapshot: old'));
    });

    it('削除対象がない場合、ログを表示すること', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);
      const spy = vi.spyOn(console, 'log');
      
      await cleanSnapshots(7);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('No old snapshots to clean'));
    });

    it('ディレクトリがない場合にエラーを無視すること', async () => {
        vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
        await expect(cleanSnapshots(7)).resolves.not.toThrow();
    });
  });
});
