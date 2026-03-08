import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { parse } from 'smol-toml';

export interface AIConfig {
  provider: 'gemini' | 'codex';
  model?: string;
}

export interface DebaConfig {
  ai: {
    planning: AIConfig;
    execution: AIConfig;
  };
}

const DEFAULT_CONFIG: DebaConfig = {
  ai: {
    planning: {
      provider: 'gemini',
    },
    execution: {
      provider: 'gemini',
    },
  },
};

const CONFIG_DIR = path.join(os.homedir(), '.deba');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.toml');

let cachedConfig: DebaConfig | null = null;

export async function loadConfig(forceReload = false): Promise<DebaConfig> {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = parse(content) as any;
    
    const config: DebaConfig = {
      ai: {
        planning: {
          provider: parsed?.ai?.planning?.provider ?? parsed?.ai?.provider ?? DEFAULT_CONFIG.ai.planning.provider,
          model: parsed?.ai?.planning?.model ?? parsed?.ai?.model,
        },
        execution: {
          provider: parsed?.ai?.execution?.provider ?? parsed?.ai?.provider ?? DEFAULT_CONFIG.ai.execution.provider,
          model: parsed?.ai?.execution?.model ?? parsed?.ai?.flash_model,
        },
      },
    };
    cachedConfig = config;
    return config;
  } catch (error) {
    cachedConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }
}

export async function initConfig() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    try {
      await fs.access(CONFIG_PATH);
      console.log(`ℹ️ 設定ファイルは既に存在します: ${CONFIG_PATH}`);
    } catch {
      const content = `[ai.planning]
# provider = "gemini"
# model = ""

[ai.execution]
# provider = "gemini"
# model = ""
`;
      await fs.writeFile(CONFIG_PATH, content, 'utf-8');
      console.log(`✅ 設定ファイルを初期化しました: ${CONFIG_PATH}`);
    }
  } catch (error) {
    console.error('❌ 設定ファイルの初期化に失敗しました:', error);
  }
}
