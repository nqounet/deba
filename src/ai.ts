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

  const args: string[] = ['-m', model, '-p', fullPrompt, '-o', 'json'];

  const rawOutput = await new Promise<string>((resolve, reject) => {
    execFile('gemini', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`gemini CLI failed: ${error.message}\nstderr: ${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });

  // JSON形式の出力をパースして、実際の回答テキストを取り出す
  let text = '';
  let cliMeta: any = {};
  try {
    // 最初の '{' から最後の '}' までを抽出してパースを試みる
    const jsonStart = rawOutput.indexOf('{');
    const jsonEnd = rawOutput.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonText = rawOutput.substring(jsonStart, jsonEnd + 1);
      const jsonOutput = JSON.parse(jsonText);
      text = jsonOutput.response || jsonOutput.text || ''; // response または text フィールドを参照
      cliMeta = jsonOutput; // トークン数などのメタ情報を保持
    } else {
      text = rawOutput.trim();
    }
  } catch (e) {
    // 万が一JSONパースに失敗した場合は、生の出力をそのまま使う（フォールバック）
    text = rawOutput.trim();
  }

  const endTime = Date.now();

  const meta = {
    timestamp: new Date().toISOString(),
    model: model,
    duration_ms: endTime - startTime,
    cli_used: true,
    ...cliMeta,
  };

  return { text: text.trim(), meta };
}
