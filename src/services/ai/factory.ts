import { IAIProvider } from './types.js';
import { GeminiProvider } from './geminiProvider.js';
import { CodexProvider } from './codexProvider.js';

export function getAIProvider(providerName: string): IAIProvider {
  if (providerName === 'codex') {
    return new CodexProvider();
  }
  return new GeminiProvider();
}
