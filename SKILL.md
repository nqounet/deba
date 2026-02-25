---
name: deba-agent
description: "AI agent CLI for requirements definition, implementation planning, code generation, and learning. Use when you need to execute a full development lifecycle (Phase A: Planning, Phase B: Implementation, Phase C: Review) or manage tasks with Deba's memory system."
---

# Deba Agent

「成長する新人エンジニア」をコンセプトとした AI エージェント CLI ツール。
要件定義・実装計画の生成（Phase A）→ コード変更の生成（Phase B）→ フィードバックからの学習（Phase C）を一気通貫で実行します。

## ワークフロー

1. **要件定義・計画立案 (Phase A)**: `deba plan` で要望から YAML 形式の計画書を作成します。
2. **実装・実行 (Phase B)**: `deba run` で計画に基づきコード変更やテストを実行します。
3. **振り返り・学習 (Phase C)**: `deba review` で成果を分析し、エピソード記憶やスキルとして蓄積します。

## 主要コマンド

### 1. タスクの実行 (`run`)
要望から計画立案、検証、実装までを自動で行います。
```bash
deba run "要望内容"
```

### 2. 計画の立案 (`plan`)
Phase A（要件定義と実装計画の YAML 生成）のみを実行します。
```bash
deba plan "要望内容"
```

### 3. 振り返り (`review`)
完了したタスクを分析し、得られた知見をエピソード記憶やスキルとして保存します。
```bash
deba review <task_id>
```

### 4. スキル確認 (`skills`)
これまでに蓄積されたスキル（意味記憶）を一覧表示します。
```bash
deba skills
```

## 設定と構成

### 設定ファイル (`~/.deba/config.toml`)
- `ai.model`: 計画（Phase A）などの高度な推論に使用するモデル。
- `ai.flash_model`: 実装（Phase B）や修正などの軽量なタスクに使用するモデル。

初期設定の作成：
```bash
deba maintenance setup-config
```

### 記憶構造
- **エピソード記憶**: 各タスクの実行詳細と結果。
- **成長ログ**: タスクを通じて得られた具体的な「学び」。
- **意味記憶 (Skills)**: 承認され、汎用化されたコーディングルールや知識。

## 注意事項
- 内部で `gemini` CLI を使用するため、環境変数 `GOOGLE_API_KEY` の設定が必要です。
- 実行ログは `snapshots/` に、記憶データは `brain/` に保存されます。
