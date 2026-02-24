import { describe, it, expect, vi } from 'vitest';
import { getSnapshotsToClean } from '../src/utils/clean';

describe('getSnapshotsToClean', () => {
  it('指定した日数より古いディレクトリのリストを返すべき', () => {
    const now = new Date('2026-02-25T12:00:00Z').getTime();
    vi.setSystemTime(now);

    const snapshotDirs = [
      { name: 'task_20260225_001', mtime: new Date('2026-02-25T10:00:00Z').getTime() }, // 今日 (新しい)
      { name: 'task_20260210_001', mtime: new Date('2026-02-10T00:00:00Z').getTime() }, // 古い (15日前)
      { name: 'task_20260218_001', mtime: new Date('2026-02-18T00:00:00Z').getTime() }, // 古い (7日前ちょうど)
    ];

    // 7日以上古いものを抽出 (25 - 7 = 18日 以前のもの)
    const result = getSnapshotsToClean(snapshotDirs, 7);
    expect(result).toEqual(['task_20260210_001', 'task_20260218_001']);

    vi.useRealTimers();
  });
});
