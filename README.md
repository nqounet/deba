# Deba

**あなたのコードで育ち、裏側で働く「専属の新人エンジニア」**

![](assets/daba-logo.png)

Deba（Developer's Evolving Brain Agent）は、要望から計画生成・隔離実行・振り返り学習までを行う AI エージェント CLI です。  
実行は Git Worktree で隔離され、学習データはリポジトリ外の `~/.deba` に保存されます。

## 特徴

- **隔離実行**: `run` / `run-plan` / `worker` は Git Worktree 上で実行し、作業中ブランチを直接汚しません。
- **学習ループ**: `review` でエピソード記録と学び抽出、`maintenance promote` でスキル昇格ができます。
- **知識注入**: 計画生成時に承認済みスキルと過去知見（SKR）が自動でプロンプトに注入されます。

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

# 初期セットアップ（設定ファイルの初期化とスキルのインストール）
npm run deba -- install
```

## 基本的な使い方

ローカル実行は `npm run deba -- <command>` を使います。  
（`npm run deba` は毎回 `npm run build` を先に実行します）

```bash
# 1) 要望から計画〜実装まで実行
npm run deba -- run "ヘッダーをロゴとナビに分割して"

# 2) 完了タスクをレビューして学習
npm run deba -- review task_20260226_123456_abcd1234

# 3) 承認待ちの学びをスキル化
npm run deba -- maintenance promote
```

## コマンド一覧（最新）

### Top-level

| Command | 説明 | 主なオプション |
| --- | --- | --- |
| `deba install` | 初期セットアップ: 設定ファイルの作成とスキルのインストールを行う | なし |
| `deba chat <message>` | LLM に直接メッセージを送り、応答を表示・スナップショット保存 | なし |
| `deba plan <request>` | Planning（計画生成）のみ実行 | `--file <path...>` |
| `deba worker` | キュー (`todo`) を監視して非同期実行 | なし |
| `deba worktree-add <repo_path> <branch_name>` | 指定リポジトリから Deba 管理配下に Worktree を作成 | `--name <worktree_name>` |
| `deba validate <filepath>` | 計画ファイルのスキーマ + DAG 検証、実行バッチ表示 | なし |
| `deba execute --step <id> --plan <filepath>` | 計画ファイルから単一ステップを実行 | `--step`, `--plan`（必須） |
| `deba run <request>` | Planning → Validate → Execution を一気通貫実行 | `--file <path...>` |
| `deba run-plan <filepath>` | 既存計画（JSON/YAML）を読み込み実行 | なし |
| `deba review <task_id>` | Review（レビュー・学び抽出） | `-y, --yes` |

### `deba maintenance` subcommands

| Command | 説明 | 主なオプション |
| --- | --- | --- |
| `deba maintenance clean` | Deba Worktree / 古いスナップショットを掃除 | `--days <number>`（既定: `7`） |
| `deba maintenance skills` | 獲得済みスキルを表示 | なし |
| `deba maintenance skills-promote <rule>` | ルール文字列を直接スキル化 | `--project <name>`（既定: `default`） |
| `deba maintenance promote` | 承認待ち提案・学びを対話形式で昇格 | `-y, --yes` |
| `deba maintenance consolidate-skills` | 既存スキルファイルを統合・整理 | なし |
| `deba maintenance setup-skill` | プロジェクト `skills/deba/SKILL.md` を `~/.agents/skills/deba/SKILL.md` にインストール | なし |
| `deba maintenance setup-config` | `~/.deba/config.toml` を初期化 | なし |

## 出力ログ例（実装準拠）

### `run`

```text
Starting Run Task: task_20260226_123456_abcd1234
--- Planning ---
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
  - 用途: 実装計画 (Planning) など、厳密な構造と自動パースが必要なデータ。
  - 理由: 構造の堅牢性と、実装コード（TypeScript）との親和性を優先。
- **YAML**: **人間（エンジニア）向け**
  - 用途: 振り返り (Reflection)、スキル抽出、知見ベースなど。
  - 理由: Markdown（多行テキスト）の扱いやすさ（リテラルブロック `|`）と、人間がエディタで直接読み書きする際の視認性を優先。

## 保存先（実装上の実際）

```text
~/.deba/
├── config.toml
└── repos/<host>/<owner>/<repo>/
    ├── snapshots/<task_id>/
    ├── worktrees/deba-wt-<task_id>/
    └── brain/
        ├── episodes/
        ├── growth_log/
        ├── queue/{todo,doing,done,failed}/
        └── skills/
            └── proposals/

~/.agents/
├── skills/deba/SKILL.md
└── knowledges/*.json
```

`setup-config` や `install` で生成される既定値:

```toml
[ai.planning]
# provider = "gemini"
# model = ""

[ai.execution]
# provider = "gemini"
# model = ""
```

※注: デフォルトではすべてコメントアウトされています。使用する前に、環境や目的に合わせて `provider` と `model` の行のコメントを解除し、明示的に適切な値を設定することをお勧めします。

## 開発

```bash
npm run build
npm test
```

## メンテナンス上の重要事項

- コマンドを追加・変更したら、必ず `skills/deba/SKILL.md` を更新
- 更新後に `npm run deba -- maintenance setup-skill` を実行して反映
- `test/skill_md.test.ts` でコマンド一覧との整合性を確認

## ライセンス

[MIT](LICENSE)
