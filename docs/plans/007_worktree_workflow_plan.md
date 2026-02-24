# Deba アジャイル開発計画 - Sprint 7: Git Worktree 統合による堅牢な実行

## 1. 背景と目的

現在の `deba` はカレントディレクトリのファイルを直接上書きするため、実装（Phase B）中に予期せぬコードの削除や破壊的な変更が起こるリスクがあります。
これを解決するため、既存の構想（`001_concept.md`）にあった **Git Worktree** を活用した隔離環境での作業フローを導入します。

**ゴール**: `deba` が自動的にメインリポジトリ外に作業用Worktreeを作成してそこでコード変更・テスト実行を行い、完了後にユーザーがレビューして本体に取り込めるようにする。また、その過程で得られた知見（Brain）は常に本体側に保存されるようにする。

---

## 2. ワークフローの設計

### Step 1: 実行の隔離 (`deba worktree-run` または `run` の拡張)
ユーザーがタスクを依頼すると、`deba` は本体の横に一時的な Worktree を作成し、そこで作業を行います。

```bash
$ deba run "ヘッダーのデザインを変更して"

# 内部処理:
# 1. taskId (例: task_20260225_001) を生成
# 2. git worktree add ../deba-wt-task_20260225_001 -b feature/task_20260225_001
# 3. Worktree内で Phase A (計画), Phase B (実装), テスト実行 を行う
# 4. スナップショットは「本体」の snapshots/ に保存する
```

### Step 2: ユーザーレビュー (手動確認)
AIの作業が完了すると、ユーザーは隔離された Worktree に移動して動作確認を行います。

```bash
$ cd ../deba-wt-task_20260225_001
$ npm start
# 問題なければ元のディレクトリに戻る
$ cd ../deba
```

### Step 3: 取り込みと振り返り (`deba review`)
既存の `review` コマンドを拡張し、承認された場合は Worktree の変更を本体にマージし、作業領域をクリーンアップします。

```bash
$ deba review task_20260225_001
> 承認しますか？ [y/n/修正内容]: y

# 内部処理:
# 1. 承認された場合:
#    git merge --squash feature/task_20260225_001
#    git worktree remove ../deba-wt-task_20260225_001 --force
#    git branch -D feature/task_20260225_001
# 2. エピソード記録（本体の brain/episodes/ へ保存）
```

---

## 3. 実装のステップ（マイルストーン）

### 3.1 本体ディレクトリパスの動的解決 (Brainの保護)
Worktree内で `deba` コマンドが実行された場合でも、`brain/` や `snapshots/` は常に「メインリポジトリ」側に保存される必要があります。

- **実装内容**: `process.cwd()` の代わりに、`git rev-parse --path-format=absolute --git-common-dir` を使用してメインリポジトリの `.git` パスを取得し、その親ディレクトリを `BRAIN_DIR` や `SNAPSHOT_DIR` の基準とする共通ユーティリティ (`src/utils/git.ts` など) を作成する。
- **対象ファイル**: `episode.ts`, `growthLog.ts`, `skills.ts`, `snapshot.ts`

### 3.2 Worktree の自動作成と実行
実行コマンド（`run`）内で Worktree を作成し、AIのコード変更（`fs.writeFile` や `npm test`）がその Worktree パスを基準に行われるようにする。

- **実装内容**:
  - `runner.ts` の `executeStep` と `executeTests` に、`workingDirectory` 引数を追加。
  - `run` コマンドで `git worktree add` を実行。
  - 失敗時（エラー終了時）でもWorktreeが放置されすぎないようなハンドリング、または再利用の仕組みを検討。

### 3.3 マージとクリーンアップの統合
`review` コマンドで「承認」された際、自動でブランチをマージして Worktree を削除するオプションを提供する。

- **実装内容**:
  - 承認時に「変更をメインブランチにマージしてWorktreeを削除しますか？ (y/n)」を追加。
  - `git merge --squash` または通常の `git merge` を実行。

---

## 4. 期待される効果

1. **破壊的変更の防止**: AIが誤って既存コードを消去しても、`git checkout` で戻す手間すらなく、Worktreeを削除するだけで済む。
2. **作業の中断・再開**: ユーザーはメインリポジトリで別の作業（別ブランチ）を進めながら、AIに裏で重いタスク（テストのリトライループ等）を回させることができる。
3. **クリーンなBrain管理**: 作業場所がどこであれ、知見（スキル・エピソード）は確実に一箇所（メインリポジトリ）に蓄積される。