import * as fs from 'fs';
import * as path from 'path';
import { getRepoStorageRoot } from './git.js';

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
  private logDir: string | null = null;

  constructor() {
    this.session = {
      sessionId: `session_${new Date().getTime()}`,
      command: process.argv.join(' '),
      startTime: new Date().toISOString(),
      totalCalls: 0,
      calls: [],
    };
  }

  private getLogDir(): string {
    if (!this.logDir) {
      this.logDir = path.join(getRepoStorageRoot(), 'brain', 'usage_logs');
    }
    return this.logDir;
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
    const logDir = this.getLogDir();
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // JSON ログの書き出し
    const logPath = path.join(logDir, `${this.session.sessionId}.json`);
    fs.writeFileSync(logPath, JSON.stringify(this.session, null, 2), 'utf-8');

    // 簡易レポートの生成
    const planningCalls = this.session.calls.filter(c => !c.model.includes('flash')).length;
    const executionCalls = this.session.calls.filter(c => c.model.includes('flash')).length;
    const savings = Math.max(0, this.session.totalCalls - 1);

    return `
📊 **Agent Usage Report**
-----------------------------------------
Session ID: ${this.session.sessionId}
Command: ${this.session.command}
Total LLM Calls: ${this.session.totalCalls}
- Planning (Premium): ${planningCalls}
- Execution (Flash): ${executionCalls}

💡 **Bulk Efficiency Tip:**
If this session was bulked, you could have saved **${savings}** premium request(s).
Log saved to: ${logPath}
-----------------------------------------
`;
  }

  public getSession() {
    return this.session;
  }
}

export const usageTracker = new UsageTracker();
