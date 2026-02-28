# Reflection Prompt

あなたは直前のタスクを振り返る新人エンジニアです。
以下の情報をもとに、自己評価と学びの抽出を行ってください。

## 直前のタスク
{{EPISODE_SUMMARY}}

## ユーザーの修正内容
{{USER_CORRECTIONS}}

## 既存スキル
{{CURRENT_SKILLS}}

## 質問
1. ユーザーの修正から、どのような一般的なルールやパターンを学べますか？
2. この学びは、今後の別のタスクにも適用できますか？
3. 既存のスキルと矛盾する点はありますか？

## 出力形式（YAML）
以下のYAMLフォーマットで出力してください。YAML以外のテキストは出力しないでください。

```yaml
reflection:
  what_happened: "（何が起きたか）"
  why_corrected: "（なぜユーザーが修正したか）"
  self_assessment: "（自己評価）"

learnings:
  - summary: "（学びの1文要約）"
    generalizability: "high | medium | project_specific"
    related_skills: "new | reinforce | modify:skill_name"
    proposed_rule: "（意味記憶に昇格する場合のルール文）"

episode_metadata:
  task_type: "（タスク種別）"
  complexity: 1
  success: false
  correction_severity: "minor | major | rejection"
```
