import { AIConfig } from './utils/config.js';
import { getAIProvider } from './services/ai/factory.js';

/**
 * AI CLI (gemini or codex) を呼び出してコンテンツを生成する。
 * SOLIDの原則（依存性逆転）に基づき、設定の読み込み自体は呼び出し側で行う。
 * 
 * @param prompt ユーザープロンプト
 * @param aiConfig AIプロバイダーとモデルの設定
 * @param systemInstruction システム指示（オプション）
 * @param options その他オプション
 */
export async function generateContent(
  prompt: string,
  aiConfig: AIConfig,
  systemInstruction?: string,
  options: { silent?: boolean } = {}
): Promise<{ text: string; meta: any }> {
  const providerName = aiConfig.provider || 'gemini';
  const selectedModel = aiConfig.model;

  const fullPrompt = systemInstruction
    ? `${systemInstruction}\n\n---\n\n${prompt}`
    : prompt;

  const estimatedPromptTokens = Math.ceil(fullPrompt.length / 4);
  const { usageTracker } = await import('./utils/usage.js');
  usageTracker.checkLimit(estimatedPromptTokens);

  const provider = getAIProvider(providerName);
  const { text, meta } = await provider.generate(prompt, aiConfig, systemInstruction, options);

  // Usage ログを記録
  usageTracker.recordCall({
    model: selectedModel || 'unknown',
    provider: providerName,
    duration_ms: meta.duration_ms,
    prompt_tokens: meta.usage?.prompt_tokens || meta.usage?.total_tokens, // metaの内容に依存
    completion_tokens: meta.usage?.completion_tokens,
  });

  return { text, meta };
}
