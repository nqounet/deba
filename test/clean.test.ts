import { describe, it, expect, vi } from 'vitest';
import { getWorktreesToClean } from '../src/utils/git';

describe('getWorktreesToClean', () => {
  it('deba-wt- で始まる worktree のリストを抽出できるべき', () => {
    const porcelainOutput = `worktree /Users/nobu/local/src/github.com/nqounet/deba
HEAD 79892ff89115a0187cc7340b7cdded9d96b285d8
branch refs/heads/main

worktree /Users/nobu/local/src/github.com/nqounet/deba-wt-task_20260225_001
HEAD 79892ff89115a0187cc7340b7cdded9d96b285d8
branch refs/heads/feature/task_20260225_001

worktree /Users/nobu/local/src/github.com/nqounet/other-wt
HEAD 79892ff89115a0187cc7340b7cdded9d96b285d8
branch refs/heads/other
`;
    const result = getWorktreesToClean(porcelainOutput);
    expect(result).toEqual([
      '/Users/nobu/local/src/github.com/nqounet/deba-wt-task_20260225_001'
    ]);
  });

  it('該当する worktree がない場合は空配列を返すべき', () => {
    const porcelainOutput = `worktree /Users/nobu/local/src/github.com/nqounet/deba
HEAD 79892ff89115a0187cc7340b7cdded9d96b285d8
branch refs/heads/main
`;
    const result = getWorktreesToClean(porcelainOutput);
    expect(result).toEqual([]);
  });
});
