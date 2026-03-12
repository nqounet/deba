import { IAIProvider, GenerateContentOptions, GenerateContentResult } from './types.js';
import { AIConfig } from '../../utils/config.js';
import { spinner } from '../../utils/spinner.js';
import { executeCLI } from './executor.js';

export class CodexProvider implements IAIProvider {
  async generate(
    prompt: string,
    aiConfig: AIConfig,
    systemInstruction?: string,
    options: GenerateContentOptions = {}
  ): Promise<GenerateContentResult> {
    const selectedModel = aiConfig.model;
    const providerName = 'codex';

    if (!options.silent) {
      spinner.start(`Requesting ${providerName}${selectedModel ? ` (${selectedModel})` : ''}...`);
    }

    const startTime = Date.now();
    const fullPrompt = systemInstruction ? `${systemInstruction}\n\n---\n\n${prompt}` : prompt;

    let args: string[] = ['exec', '-', '--json'];
    if (aiConfig.yolo !== false) {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    }
    if (selectedModel) {
      args.push('-m', selectedModel);
    }

    const rawOutput = await executeCLI('codex', args, fullPrompt, options);

    if (!options.silent) spinner.succeed(`Received response from ${providerName}`);

    let text = '';
    let cliMeta: any = {};

    try {
      const lines = rawOutput.trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const json = JSON.parse(line);
        if (json.type === 'item.completed' && json.item?.type === 'agent_message') {
          text = json.item.text;
        } else if (json.type === 'turn.completed') {
          cliMeta.usage = json.usage;
        }
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
