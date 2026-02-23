import { execFile } from 'child_process';

const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function generateContent(
  prompt: string,
  model: string = DEFAULT_MODEL,
  systemInstruction?: string
): Promise<{ text: string; meta: any }> {
  const startTime = Date.now();

  // システムプロンプトがある場合はプロンプトに前置する
  const fullPrompt = systemInstruction
    ? `${systemInstruction}\n\n---\n\n${prompt}`
    : prompt;

  const args: string[] = ['-m', model, '-p', fullPrompt];

  const text = await new Promise<string>((resolve, reject) => {
    execFile('gemini', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`gemini CLI failed: ${error.message}\nstderr: ${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });

  const endTime = Date.now();

  const meta = {
    timestamp: new Date().toISOString(),
    model: model,
    duration_ms: endTime - startTime,
    cli_used: true,
  };

  return { text: text.trim(), meta };
}
