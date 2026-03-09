import * as fs from 'fs';
import * as path from 'path';
import { getRepoStorageRoot } from './git-base.js';

export interface UsageCall {
  timestamp: string;
  model: string;
  provider: string;
  duration_ms: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface UsageSession {
  sessionId: string;
  command: string;
  startTime: string;
  endTime?: string;
  totalCalls: number;
  calls: UsageCall[];
}

class UsageTracker {
  private session: UsageSession;
  private logDir: string;

  constructor() {
    this.logDir = path.join(getRepoStorageRoot(), 'brain', 'usage_logs');
    this.session = {
      sessionId: `session_${new Date().getTime()}`,
      command: process.argv.join(' '),
      startTime: new Date().toISOString(),
      totalCalls: 0,
      calls: [],
    };
  }

  /**
   * LLM呼び出しを記録する
   */
  public recordCall(call: Omit<UsageCall, 'timestamp'>) {
    const fullCall: UsageCall = {
      ...call,
      timestamp: new Date().toISOString(),
    };
    this.session.calls.push(fullCall);
    this.session.totalCalls++;
  }

  /**
   * セッションを終了し、ログを保存してレポートを返す
   */
  public finalize(): string {
    this.session.endTime = new Date().toISOString();
    
    // ログディレクトリの作成
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // JSON ログの書き出し
    const logPath = path.join(this.logDir, `${this.session.sessionId}.json`);
    fs.writeFileSync(logPath, JSON.stringify(this.session, null, 2), 'utf-8');

    // 簡易レポートの生成
    const planningCalls = this.session.calls.filter(c => !c.model.includes('flash')).length;
    const executionCalls = this.session.calls.filter(c => c.model.includes('flash')).length;
    
    // 合計トークン数の計算
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    this.session.calls.forEach(c => {
      if (c.prompt_tokens) totalPromptTokens += c.prompt_tokens;
      if (c.completion_tokens) totalCompletionTokens += c.completion_tokens;
    });

    return `
📊 **Agent Usage Report**
-----------------------------------------
Session ID: ${this.session.sessionId}
Command: ${this.session.command}
Total LLM Calls: ${this.session.totalCalls}
- Planning (Premium): ${planningCalls}
- Execution (Flash): ${executionCalls}

Total Tokens Used:
- Prompt: ${totalPromptTokens}
- Completion: ${totalCompletionTokens}

Log saved to: ${logPath}
-----------------------------------------
`;
  }

  public getSession() {
    return this.session;
  }
}

export const usageTracker = new UsageTracker();
