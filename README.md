# Deba

**あなたのコードで育ち、裏側で働く「専属の新人エンジニア」**

![](assets/daba-logo.png)

Deba（Developer's Evolving Brain Agent）は、要望から計画生成・隔離実行・振り返り学習までを行う AI エージェント CLI です。  
アーキテクチャの刷新により、ファイルベースのキュー通信と常駐ワーカー（Eternal Worker）を組み合わせた、より自律的で文脈を維持できる実行環境へと進化しました。実行は Git Worktree で隔離され、学習データはリポジトリ外の `~/.deba` に保存されます。

## 特徴

- **常駐ワーカー（Eternal Worker）**: `deba worker` による履歴管理型の疑似セッション。複数のステップや修正にまたがる文脈を維持しながら、長期的なタスクの自律実行を行います。
- **ファイルベースキュー通信**: ディレクトリへのファイル追加をキューとして利用し、常駐しているワーカーが非同期でタスクを処理します。
- **シングルトン・ワーカー**: ワーカープロセスはリポジトリごとに唯一のリソースとして常駐し、二重起動は禁止されています。起動していない場合は `deba worker` で手動起動する必要があります。
- **隔離実行**: `run` / `run-plan` / `worker` でのコード変更やテストは Git Worktree 上で行われ、ユーザーのメインブランチを一切汚しません。
- **学習ループ**: `review` でエピソード記録と学び抽出、`maintenance promote` でスキル昇格ができます。
- **知識注入**: 計画生成時に承認済みスキルと過去知見（SKR）が自動でプロンプトに注入されます。

## 新しくなった `worker` の仕組み

Deba の自律性を支えるコアとして、新たに **履歴管理型疑似セッション・ワーカー** アーキテクチャが導入されています。

1. **履歴管理型疑似セッション（Context & State Management）**
   LLM のステートレスな性質を補うため、「対話履歴」を配列として保持・統合してリクエストを送ることで、永続的なセッションを擬似的に実現しています。これにより「直前に行ったテストのエラー結果を踏まえてコードを修正する」といった、高度な自己修復（Self-healing）が可能になっています。
2. **ファイルベースの堅牢なキューシステム**
   DB や複雑なプロセス間通信を使わず、`todo`, `doing`, `done`, `failed` といったディレクトリ間のファイル移動でタスクの状態を管理します。実行プロセスのデッドロックを防ぎ、中断・再開に強い堅牢な設計です。
3. **イベント駆動の待機（fs.watch）**
   キューにタスクがない間、ワーカーは API リクエストを完全に停止し、`fs.watch` を用いて低負荷で待機します。他のコマンドからキューディレクトリにタスクファイルが投入されるとイベントを検知し、即座に LLM の自律ループを再開します。

## 前提条件

- Node.js / npm
- Git（`origin` remote が設定されているリポジトリで実行）
- いずれかの LLM CLI
  - 既定: `gemini`
  - 代替: `codex`（`~/.deba/config.toml` で `ai.provider = "codex"`）

## セットアップ

```bash
git clone https://github.com/nqounet/deba.git
cd deba
npm install
npm run build

# 設定ファイルを初期化（未作成時のみ）
npm run deba -- maintenance setup-config

# Deba スキル定義を ~/.agents/skills/deba/SKILL.md に反映
npm run deba -- maintenance setup-skill
```

## 基本的な使い方

ローカル実行は `npm run deba -- <command>` を使います。  
（`npm run deba` は毎回 `npm run build` を先に実行します）

```bash
# 1) 常駐ワーカーを別ターミナル等で起動（待機状態にする）
npm run deba -- worker

# 2) 要望から計画〜実装までをキューに投入し実行
npm run deba -- run "ヘッダーをロゴとナビに分割して"

# 3) 完了タスクをレビューして学習
npm run deba -- review task_20260226_123456_abcd1234

# 4) 承認待ちの学びをスキル化
npm run deba -- maintenance promote
```

## コマンド一覧（最新）

### Top-level

| Command | 説明 | 主なオプション |
| --- | --- | --- |
| `deba chat <message>` | LLM に直接メッセージを送り、応答を表示・スナップショット保存 | なし |
| `deba plan <request>` | Phase A（計画生成）のみ実行 | `--file <path...>` |
| `deba worker` | **キュー (`todo`) を監視し、タスク投入時に連続実行する常駐プロセス** | なし |
| `deba worktree-add <repo_path> <branch_name>` | 指定リポジトリから Deba 管理配下に Worktree を作成 | `--name <worktree_name>` |
| `deba validate <filepath>` | 計画ファイルのスキーマ + DAG 検証、実行バッチ表示 | なし |
| `deba execute --step <id> --plan <filepath>` | 計画ファイルから単一ステップを実行 | `--step`, `--plan`（必須） |
| `deba run <request>` | Phase A → Validate を経て、キューにタスクを投入し一気通貫で実行 | `--file <path...>` |
| `deba run-plan <filepath>` | 既存計画（JSON/YAML）を読み込みキューに投入して実行 | なし |
| `deba review <task_id>` | Phase C（レビュー・学び抽出） | `-y, --yes` |

### `deba maintenance` subcommands

| Command | 説明 | 主なオプション |
| --- | --- | --- |
| `deba maintenance clean` | Deba Worktree / 古いスナップショットを掃除 | `--days <number>`（既定: `7`） |
| `deba maintenance skills` | 獲得済みスキルを表示 | なし |
| `deba maintenance skills-promote <rule>` | ルール文字列を直接スキル化 | `--project <name>`（既定: `default`） |
| `deba maintenance promote` | 承認待ち提案・学びを対話形式で昇格 | `-y, --yes` |
| `deba maintenance consolidate-skills` | 既存スキルファイルを統合・整理 | なし |
| `deba maintenance setup-skill` | プロジェクト `SKILL.md` を `~/.agents/skills/deba/SKILL.md` にインストール | なし |
| `deba maintenance setup-config` | `~/.deba/config.toml` を初期化 | なし |

## 出力ログ例（実装準拠）

### `run`

```text
Starting Run Task: task_20260226_123456_abcd1234
--- Phase A (Plan) ---
Sending plan request to LLM (gemini-2.5-pro)...
Extracting and parsing YAML...
--- Validate ---
✅ Validation passed. 2 Execution Batches constructed.
--- Creating Git Worktree for isolation ---
Directory: ~/.deba/repos/.../worktrees/deba-wt-task_20260226_123456_abcd1234
Branch: feature/task_20260226_123456_abcd1234
🚀 Isolated execution in worktree: ~/.deba/repos/.../worktrees/deba-wt-task_...
...
🎉 Task task_... completed successfully in worktree!
👉 次に、以下のコマンドを実行してレビューを行い、学びを記録してください：
   npm run deba -- review task_20260226_123456_abcd1234
```

### `validate`

```text
--- Validating docs/plans/example.yml ---
[1] Schema Validation:
✅ Schema is valid.
[2] Execution DAG & Batching:
✅ DAG is valid. No circular dependencies.
📦 Constructed 2 Execution Batches:
  Batch 1: Steps [1] (Exclusive)
  Batch 2: Steps [2, 3] (Parallel)
```

### `review`（承認しない場合）

```text
--- Review Task: task_... ---
Steps executed: Step 1, Step 2
承認しますか？ [y/修正内容を入力]:
🔄 修正内容を受け付けました。Reflection を実行します...
Sending Reflection request to LLM...
✅ Reflection完了。学び候補が成長ログに追記されました。
```

## 設計思想：出力フォーマットの選択基準

Deba では、LLM との通信およびデータの保存において、**「主な読み手が誰か」**に基づいてフォーマットを使い分けています。

- **JSON**: **実行エンジン（機械）向け**
  - 用途: 実装計画 (Phase A) など、厳密な構造と自動パースが必要なデータ。
  - 理由: 構造の堅牢性と、実装コード（TypeScript）との親和性を優先。
- **YAML**: **人間（エンジニア）向け**
  - 用途: 振り返り (Reflection)、スキル抽出、知見ベースなど。
  - 理由: Markdown（多行テキスト）の扱いやすさ（リテラルブロック `|`）と、人間がエディタで直接読み書きする際の視認性を優先。

## 保存先（実装上の実際）

ファイルベースのキュー構造など、現在のワークフローの中核となる構成です。

```text
~/.deba/
├── config.toml
└── repos/<host>/<owner>/<repo>/
    ├── snapshots/<task_id>/
    ├── worktrees/deba-wt-<task_id>/
    └── brain/
        ├── episodes/
        ├── growth_log/
        ├── queue/
        │   ├── todo/      # タスクが追加されると Worker が処理を開始
        │   ├── doing/     # Worker が実行中のタスク
        │   ├── done/      # 完了済みのタスク
        │   └── failed/    # 失敗したタスク
        └── skills/
            └── proposals/

~/.agents/
├── skills/deba/SKILL.md
└── knowledges/*.json
```

`setup-config` で生成される既定値:

```toml
[ai]
provider = "gemini"
model = "gemini-2.0-flash-exp"
flash_model = "gemini-2.0-flash-exp"
```

## 開発

```bash
npm run build
npm test
```

## メンテナンス上の重要事項

- コマンドを追加・変更したら、必ず `SKILL.md` を更新
- 更新後に `npm run deba -- maintenance setup-skill` を実行して反映
- `test/skill_md.test.ts` でコマンド一覧との整合性を確認

## ライセンス

[MIT](LICENSE)
