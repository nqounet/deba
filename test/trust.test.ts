import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as trust from '../src/trust';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}));

vi.mock('../src/utils/git', () => ({
  getRepoStorageRoot: () => '/mock/repo'
}));

describe('trust module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTrustData', () => {
    it('ファイルがない場合はデフォルト値を返すこと', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      const data = await trust.getTrustData();
      expect(data).toEqual({ totalTasks: 0, approvedTasks: 0, recentHistory: [] });
    });

    it('ファイルがある場合はパースして返すこと', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ totalTasks: 5, approvedTasks: 3, recentHistory: [true, false] }));
      const data = await trust.getTrustData();
      expect(data.totalTasks).toBe(5);
    });
  });

  describe('updateTrust', () => {
    it('成功時にapprovedTasksが増加し、履歴が保存されること', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      await trust.updateTrust(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('trust.json'),
        expect.stringContaining('"approvedTasks": 1'),
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('trust.json'),
        expect.stringContaining('"recentHistory": [\n    true\n  ]'),
        'utf-8'
      );
    });

    it('50件を超えた場合は古い履歴が消えること', async () => {
      const oldHistory = new Array(50).fill(false);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ totalTasks: 50, approvedTasks: 0, recentHistory: oldHistory }));
      
      await trust.updateTrust(true);
      
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const writtenData = JSON.parse(writeCall);
      expect(writtenData.recentHistory.length).toBe(50);
      expect(writtenData.recentHistory[49]).toBe(true);
    });
  });

  describe('calculateTrustLevel', () => {
    it('初期状態はレベル1', () => {
      expect(trust.calculateTrustLevel({ totalTasks: 0, approvedTasks: 0, recentHistory: [] })).toBe(1);
    });

    it('10件未満はどんなに成功してもレベル1', () => {
      expect(trust.calculateTrustLevel({ totalTasks: 9, approvedTasks: 9, recentHistory: new Array(9).fill(true) })).toBe(1);
    });

    it('直近20件で80%以上承認ならレベル2', () => {
      const history = new Array(10).fill(true);
      expect(trust.calculateTrustLevel({ totalTasks: 10, approvedTasks: 10, recentHistory: history })).toBe(2);
    });

    it('直近50件で90%以上承認、かつ全30件以上ならレベル3', () => {
      const history = new Array(30).fill(true);
      expect(trust.calculateTrustLevel({ totalTasks: 30, approvedTasks: 30, recentHistory: history })).toBe(3);
    });
  });
});