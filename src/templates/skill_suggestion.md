# Skill Extraction Prompt

あなたは成功したタスクから「再利用可能な知見」を抽出するシニアエンジニアです。
以下のタスク実行結果から、今後の開発に役立つ汎用的なルールやスキルを1つ抽出してください。

## タスク内容
{{TASK_DESCRIPTION}}

## 実行結果（コード変更内容）
{{TASK_RESULT}}

## 出力指示
以下のYAMLフォーマットで出力してください。Markdownのコードブロック（```yaml ... ```）で囲んでください。
値にコロン (`:`) が含まれる場合は、必ずダブルクォーテーション (`"`) で囲んでください。

```yaml
skill:
  name: "(スキルの短い英名。例: vitest-naming-convention)"
  summary: "(スキルの1文説明)"
  rule: |
    (具体的なルール内容をMarkdown形式で記述。
     手順や禁止事項、推奨されるパターンなどを含めること)
  project: "default"
```
