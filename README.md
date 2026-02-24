# Deba

**「成長する新人エンジニア」** をコンセプトとした AI エージェント CLI ツール。

ユーザーの要望を受け取り、要件定義・実装計画の生成（Phase A）→ コード変更の生成（Phase B）→ フィードバックからの学習（Phase C）を一気通貫で実行します。タスクを重ねるごとに過去の学びが蓄積され、ユーザーの介入なしに高品質な成果物を生成できるよう「成長」していきます。

## 特長

- **3フェーズ実行** — 上流判断（Phase A）で要件定義・実装計画・注意事項を一括生成し、実装（Phase B）で並列コード生成、振り返り（Phase C）でフィードバックから学習
- **3層記憶モデル** — エピソード記憶（タスク経験）→ 成長ログ（学びの追跡）→ 意味記憶（承認済みスキル）の3層で「成長」を実現
- **入出力の透明性** — すべての LLM 呼び出しの入出力をスナップショットとして自動保存し、対比・再現が可能
- **外部 SDK 不要** — `gemini` CLI を直接呼び出すシンプルなアーキテクチャ

## セットアップ

### 前提条件

- Node.js
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) がインストール済みであること

### インストール

```bash
git clone https://github.com/nqounet/deba.git
cd deba
npm install
```

## 使い方

```bash
# ビルド
npm run build

# ビルド＋実行
npm run deba -- <command>
```

### コマンド一覧

| コマンド | 説明 |
|---------|------|
| `deba chat <message>` | 単純な LLM チャット |
| `deba plan <request>` | Phase A: 要件定義と実装計画を YAML で生成 |
| `deba validate <file>` | Phase A 出力のスキーマ / DAG 検証 |
| `deba execute --step <id> --plan <file>` | Phase B: 単一ステップのコード生成 |
| `deba run <request>` | Plan → Validate → Execute の一気通貫実行 |
| `deba review <task_id>` | Phase C: フィードバック → エピソード記録 → Reflection |
| `deba skills` | 獲得スキル一覧の表示 |
| `deba skills-promote <rule>` | 学びをスキル（意味記憶）に昇格 |

### 実行例

```bash
# 要件定義・実装計画の生成
npm run deba -- plan "ユーザー登録フォームにバリデーションを追加して"

# 計画→検証→実装の一気通貫実行
npm run deba -- run "ヘッダーコンポーネントを分割して"

# タスク完了後のフィードバック
npm run deba -- review task_20260223_001
```

## ディレクトリ構成

```
deba/
├── src/                  # TypeScript ソースコード
│   ├── cli.ts            #   CLI エントリーポイント
│   ├── ai.ts             #   LLM 呼び出し (gemini CLI)
│   ├── commands/         #   CLI コマンド実装 (plan, run, review等)
│   ├── prompt.ts         #   プロンプト構築 (Phase A/B/C)
│   ├── validator.ts      #   Phase A 出力のバリデーション
│   ├── dag.ts            #   依存グラフ → 並列バッチ構築
│   ├── runner.ts         #   バッチ実行エンジン
│   ├── yamlParser.ts     #   YAML パーサー
│   ├── snapshot.ts       #   入出力スナップショット管理
│   ├── episode.ts        #   エピソード記憶
│   ├── growthLog.ts      #   成長ログ
│   ├── skills.ts         #   意味記憶（スキル）管理
│   ├── knowledge.ts      #   ドメイン知識抽出・管理
│   └── utils/            #   ユーティリティ (git操作, クリーンアップ等)
├── docs/                 # ドキュメント群
│   ├── design/           #   設計書（コンセプト〜詳細設計）
│   ├── plans/            #   計画書（LLM 利用計画、開発計画）
│   └── drafts/           #   プロンプトドラフト等
├── brain/                # ローカル学習データ（.gitignore 対象）
│   ├── skills/           #   意味記憶（承認済みルール）
│   └── episodes/         #   エピソード記憶
├── snapshots/            # LLM 入出力スナップショット（.gitignore 対象）
└── build/                # コンパイル済み JS（.gitignore 対象）
```

## 設計ドキュメント

詳細な設計・計画については `docs/` を参照してください。

| ディレクトリ | ファイル | 内容 |
|------------|---------|------|
| `docs/design/` | `001_concept.md` | システム全体像（Worktree, Brain, プロンプト管理） |
| | `002_v2.md` | 成長メカニズムの初期検討 |
| | `003_v3_growth_system.md` | 3層記憶モデル・学習サイクル・信頼レベルの詳細設計 |
| `docs/plans/` | `004_llm_usage_plan.md` | LLM 使用計画 v1 |
| | `005_llm_usage_plan_v2.md` | LLM 使用計画 v2（Phase A/B/C 設計、エラーハンドリング） |
| | `006_agile_development_plan.md` | アジャイル開発計画（Sprint 0〜6） |
| `docs/drafts/` | `phase_a_prompt_draft.md` | Phase A 統合プロンプトのテンプレート |

## 技術スタック

- **言語**: TypeScript (ESNext, NodeNext modules)
- **ビルド**: `tsc` → `build/` に出力
- **LLM**: `gemini` CLI（`child_process.execFile` 経由）
- **依存ライブラリ**: `commander`（CLI）, `yaml`（YAML パース）

## ライセンス

[MIT](LICENSE)
