import { IAIProvider, GenerateContentOptions, GenerateContentResult } from './types.js';
import { AIConfig } from '../../utils/config.js';
import { spinner } from '../../utils/spinner.js';
import { executeCLI } from './executor.js';

export class GeminiProvider implements IAIProvider {
  async generate(
    prompt: string,
    aiConfig: AIConfig,
    systemInstruction?: string,
    options: GenerateContentOptions = {}
  ): Promise<GenerateContentResult> {
    const selectedModel = aiConfig.model;
    const providerName = 'gemini';

    if (!options.silent) {
      spinner.start(`Requesting ${providerName}${selectedModel ? ` (${selectedModel})` : ''}...`);
    }

    const startTime = Date.now();
    const fullPrompt = systemInstruction ? `${systemInstruction}\n\n---\n\n${prompt}` : prompt;

    let args: string[] = ['-o', 'json'];
    if (selectedModel) {
      args.push('-m', selectedModel);
    }

    const rawOutput = await executeCLI('gemini', args, fullPrompt, options);

    if (!options.silent) spinner.succeed(`Received response from ${providerName}`);

    let text = '';
    let cliMeta: any = {};

    try {
      const jsonStart = rawOutput.indexOf('{');
      const jsonEnd = rawOutput.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonText = rawOutput.substring(jsonStart, jsonEnd + 1);
        const jsonOutput = JSON.parse(jsonText);
        text = jsonOutput.response || jsonOutput.text || '';
        cliMeta = jsonOutput;
      } else {
        text = rawOutput.trim();
      }
    } catch (e) {
      text = rawOutput.trim();
    }

    const endTime = Date.now();
    const meta = {
      timestamp: new Date().toISOString(),
      provider: providerName,
      model: selectedModel,
      duration_ms: endTime - startTime,
      cli_used: true,
      ...cliMeta,
    };

    return { text: text.trim(), meta };
  }
}
