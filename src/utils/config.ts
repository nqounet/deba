import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { parse, stringify } from 'smol-toml';

export interface DebaConfig {
  ai: {
    provider?: 'gemini' | 'codex';
    model: string;
    flash_model: string;
  };
}

const DEFAULT_CONFIG: DebaConfig = {
  ai: {
    provider: 'gemini',
    model: 'gemini-2.0-flash-exp', // 計画（Phase A）用
    flash_model: 'gemini-2.0-flash-exp', // 実装（Phase B）用
  },
};

const CONFIG_DIR = path.join(os.homedir(), '.deba');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.toml');

export async function loadConfig(): Promise<DebaConfig> {
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = parse(content) as any;
    
    return {
      ai: {
        provider: parsed?.ai?.provider ?? DEFAULT_CONFIG.ai.provider,
        model: parsed?.ai?.model ?? DEFAULT_CONFIG.ai.model,
        flash_model: parsed?.ai?.flash_model ?? DEFAULT_CONFIG.ai.flash_model,
      },
    };
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

export async function initConfig() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    try {
      await fs.access(CONFIG_PATH);
    } catch {
      const content = stringify(DEFAULT_CONFIG as any);
      await fs.writeFile(CONFIG_PATH, content, 'utf-8');
      console.log(`✅ 設定ファイルを初期化しました: ${CONFIG_PATH}`);
    }
  } catch (error) {
    console.error('❌ 設定ファイルの初期化に失敗しました:', error);
  }
}
