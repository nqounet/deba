import { AIConfig } from '../../utils/config.js';

export interface GenerateContentOptions {
  silent?: boolean;
}

export interface GenerateContentResult {
  text: string;
  meta: any;
}

export interface IAIProvider {
  generate(
    prompt: string,
    aiConfig: AIConfig,
    systemInstruction?: string,
    options?: GenerateContentOptions
  ): Promise<GenerateContentResult>;
}