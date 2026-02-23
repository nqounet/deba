# Phase A 統合プロンプト ドラフト v1

## 目的

1回のLLM呼び出しで「要件定義 + 実装計画 + 注意事項」を同時生成するためのプロンプトテンプレート。

---

## プロンプトテンプレート

```
あなたは、ユーザーの要望をソフトウェア実装に変換する上流設計エンジニアです。
以下の情報に基づき、要件定義・実装計画・注意事項を**1つのYAMLドキュメント**として出力してください。

## ユーザーの要望

{{USER_REQUEST}}

## プロジェクト情報

{{PROJECT_SUMMARY}}

## 対象ファイルのソースコード

{{TARGET_SOURCE_CODE}}

## 過去の学び（意味記憶）

{{SEMANTIC_MEMORY}}

## 関連する過去のタスク（エピソード記憶）

{{RELATED_EPISODES}}

## 依存先のインターフェース定義

{{DEPENDENCY_INTERFACES}}

---

## 出力指示

以下のYAMLフォーマットに**厳密に従って**出力してください。
YAMLの外にテキストを出力しないでください。

### 出力フォーマット

```yaml
requirements:
  goal: "(目的を1文で要約)"
  specs:
    - item: "(仕様項目)"
      reasoning: "(なぜこの仕様にするのかの根拠)"
  acceptance_criteria:
    - "(完了条件。テストで検証可能な形式で記述)"

implementation_plan:
  steps:
    - id: 1
      description: "(実装内容を具体的に記述)"
      target_files:
        - "(変更対象のファイルパス)"
      parallelizable: true
      dependencies: []
    - id: 2
      description: "(実装内容)"
      target_files:
        - "(ファイルパス)"
      parallelizable: false
      dependencies: [1]

cautions:
  - context: "(関連する過去の学びや制約事項)"
    instruction: "(この実装で注意すべき具体的な点)"
```

### 出力ルール

1. `requirements.specs` には最低1項目を含めること
2. `requirements.acceptance_criteria` にはテスト可能な完了条件を最低1つ含めること
3. `implementation_plan.steps` には最低1ステップを含めること
4. 各ステップの `target_files` には実在するファイルパスを記載すること（新規作成の場合は作成先パスを記載）
5. `dependencies` には依存する他ステップの `id` を配列で指定すること。依存なしの場合は空配列 `[]`
6. `parallelizable` は、他のステップと並行実行可能な場合に `true` とすること
7. `cautions` には、過去の学びから得た注意点を最低1つ含めること。該当する学びがない場合は、一般的なベストプラクティスに基づく注意点を記載すること
```

---

## コンテキスト注入の実装指針

### トークン予算の配分（Phase Aのコンテキスト長上限に対する割合）

| 変数 | 優先度 | 配分 | 切り捨て戦略 |
|------|--------|------|------------|
| `USER_REQUEST` | 必須 | 5% | 切り捨てない |
| `SEMANTIC_MEMORY` | 必須 | 10% | 直近の承認済みスキルから優先。古いものから切り捨て |
| `TARGET_SOURCE_CODE` | 必須 | 40% | 変更対象ファイル全文 → 依存ファイルはインターフェース部分のみ |
| `PROJECT_SUMMARY` | 重要 | 15% | Ingestion結果のJSON全体 → フィールド単位で重要度順に切り捨て |
| `RELATED_EPISODES` | 推奨 | 10% | 直近5エピソードの要約のみ。古いものから除外 |
| `DEPENDENCY_INTERFACES` | 任意 | 20% | 型定義・関数シグネチャのみ抽出。実装詳細は除外 |

### 切り捨て順序

トークン上限を超える場合、以下の順序で削減する:

1. `DEPENDENCY_INTERFACES` を除外
2. `RELATED_EPISODES` を除外
3. `PROJECT_SUMMARY` をファイルツリーのみに縮小
4. `TARGET_SOURCE_CODE` を変更対象ファイルのみに限定（依存ファイル除外）
5. それでも超過する場合 → フォールバック（Phase A分割）を発動

---

## バリデーションの実装指針

Phase Aの出力に対し、以下の順序でバリデーションを実行する。

### ステップ1: YAMLパース

```
出力文字列 → YAMLパーサー
  ├─ 成功 → ステップ2へ
  └─ 失敗 → 修復プロンプト送信（1回のみ）
               ├─ 成功 → ステップ2へ
               └─ 失敗 → フォールバック（Phase A分割）
```

修復プロンプト:
```
先ほど出力したYAMLにパースエラーがあります。
エラー内容: {{PARSE_ERROR}}

元の出力を修正し、valid なYAMLとして再出力してください。
内容は変更せず、フォーマットのみ修正してください。
```

### ステップ2: スキーマ検証

必須フィールドの存在チェック:

```
必須:
  - requirements.goal (string, 非空)
  - requirements.acceptance_criteria (array, 要素数 ≥ 1)
  - implementation_plan.steps (array, 要素数 ≥ 1)
  - implementation_plan.steps[].id (integer)
  - implementation_plan.steps[].description (string, 非空)
  - implementation_plan.steps[].target_files (array, 要素数 ≥ 1)
  - implementation_plan.steps[].parallelizable (boolean)
  - implementation_plan.steps[].dependencies (array)

推奨（欠如時は警告のみ）:
  - requirements.specs (array)
  - cautions (array)
```

- 必須フィールドが欠落 → フォールバック
- 推奨フィールドが欠落 → 警告ログを記録し続行

### ステップ3: 依存グラフ整合性

```
全steps のdependencies を走査:
  1. 参照先IDが steps 内に存在するか確認
  2. トポロジカルソートを試行し、循環依存がないか確認
     ├─ 循環検出 → フォールバック
     └─ 正常 → ステップ4へ
```

### ステップ4: 並列バッチの構築

検証済みの依存グラフからバッチを構築する:

```
1. 依存なし（dependencies = []）のステップを「バッチ1」に投入
2. バッチ1の全ステップに依存するステップを「バッチ2」に投入
3. 以降、同様に繰り返す
4. 同一バッチ内で target_files が重複するステップがあれば、
   後方のステップを次のバッチに移動（ファイルレベル排他制御）
```

---

## 出力後半品質の検証方法

### 評価基準

Phase A出力の「後半品質劣化」を以下のメトリクスで評価する:

| メトリクス | 計測方法 | 合格基準 |
|-----------|---------|---------|
| **cautionsセクションの具体性** | cautions[].instruction の平均文字数を、specs[].reasoning の平均文字数と比較 | cautions側が specs側の50%以上 |
| **最終ステップの詳細度** | steps配列の最後の要素のdescription文字数を、最初の要素と比較 | 最後が最初の50%以上 |
| **acceptance_criteriaの検証可能性** | 各criteriaが「〜であること」「〜が動作すること」などの検証可能な形式かを人手で判定 | 全criteriaの80%以上が検証可能 |

### 検証手順

1. 5〜10件のサンプルタスク（小規模2件、中規模3件、大規模2件）を用意
2. 各タスクに対しPhase Aプロンプトを実行
3. 上記メトリクスを計測
4. 合格基準を満たさない場合、以下の対策を検討:
   - プロンプト内でcautionsセクションの重要性を強調するアンカー文を追加
   - 出力順序をcautions → implementation_plan → requirementsに変更し、重要セクションを前半に移動
   - フォールバック閾値を緩和し、分割実行をデフォルトに近づける
