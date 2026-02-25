# システムアーキテクチャ: Deba - Portable Agent & Worktree Integration

## 1. システム全体像

Deba は、既存の Git リポジトリ内に「エージェント専用の作業領域（Worktree）」を自動構築し、そこで自律的に作業を行う「成長する新人エンジニア」型 AI エージェント CLI です。
グローバル設定に依存せず、プロジェクトルート内に知識（Brain）と作業領域（Worktrees）を保持する「ポータブル・エージェント」の思想に基づいています。

## 2. ディレクトリ構造とデータ管理

Deba は、プロジェクトのリポジトリをクリーンに保つため、すべての知識（Brain）、スナップショット、作業領域（Worktrees）をユーザーのホームディレクトリ配下に集約して管理します。

### 2.1 Global Repository Storage (`~/.deba/repos/{remote_path}/`)

各リポジトリの `origin` URL に基づいた名前空間でデータを隔離保存します。
例: `ssh://git@github.com/nqounet/deba.git` -> `~/.deba/repos/github.com/nqounet/deba/`

```text
~/.deba/repos/{remote_path}/
├── brain/                    # エージェントの知識
│   ├── ingestion.md          # プロジェクト解析結果
│   ├── episodes/             # 実行記録
│   ├── skills/               # 承認済みスキル
│   └── growth_log/           # 学びの集約ログ
├── snapshots/                # LLM 入出力履歴
└── worktrees/                # 隔離実行用の作業領域
    └── deba-wt-{task_id}/    # 一時的な Git Worktree 実体
```

---

## 3. ワークフロー詳細

### A. Ingestion (プロジェクト取り込み)

初めてのリポジトリ作業時、Deba は自動的に `ingestion` を実行し、その結果をグローバルストレージの `brain/ingestion.md` に保存します。これにより、リポジトリ内を汚すことなく、エージェントがプロジェクトの構造を理解できます。

### B. 隔離実行 (Git Worktree)

1. **Worktree作成**: `git worktree add -b feature/{task_id} .worktrees/deba-wt-{task_id}` を実行。
2. **自律作業**: エージェントは隔離された Worktree 内でコードを修正し、テストを実行します。
3. **マージ & クリーンアップ**: 作業完了後、`git merge --squash` により変更を本体に取り込み、Worktree を削除します。

### C. 自己成長サイクル

1. **Episode 記録**: タスク完了時に「何をしたか」「何が問題だったか」を `brain/episodes/` に保存。
2. **Review & Learning**: ユーザーによる `deba review` を通じて「学び」を抽出し、`growth_log` に記録。
3. **Consolidation**: `maintenance consolidate-skills` により、蓄積された学びを整理・統合し、`brain/skills/` の規約をリファクタリングします。

---

## 4. 技術的なキーポイント

### 1. ポータビリティと一貫性
知識（Brain）がプロジェクト内にあるため、開発者が変わったり、別のマシンで作業を再開したりしても、Deba はこれまでのコンテキスト（規約や過去の修正経緯）を維持したまま作業を継続できます。

### 2. `git worktree` による安全な自動化
メインの作業ディレクトリを一切汚さず、エージェントが裏側で「別デスク」で作業するような環境を提供します。これにより、ユーザーの作業を中断させることなく、並行してエージェントを動かすことが可能です。

### 3. コンテキストの動的注入
タスク実行時、`ingestion.md` (全体像)、`skills/` (規約)、`episodes/` (過去の成功/失敗) を動的に組み合わせてプロンプトを構築することで、LLM の精度を最大限に引き出します。
