import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SKILL.md consistency', () => {
  it('should contain all implemented CLI commands', async () => {
    const skillMdPath = path.join(__dirname, '../SKILL.md');
    const skillMd = await fs.readFile(skillMdPath, 'utf-8');

    // src/cli.ts で公開している全コマンド
    const requiredCommands = [
      'deba chat <message>',
      'deba plan <request>',
      'deba worker',
      'deba worktree-add <repo_path> <branch_name>',
      'deba validate <filepath>',
      'deba execute --step <id> --plan <filepath>',
      'deba run <request>',
      'deba run-plan <filepath>',
      'deba review <task_id>',
      'deba maintenance clean',
      'deba maintenance skills',
      'deba maintenance skills-promote <rule>',
      'deba maintenance promote',
      'deba maintenance consolidate-skills',
      'deba maintenance setup-skill',
      'deba maintenance setup-config',
    ];

    for (const cmd of requiredCommands) {
      expect(skillMd).toContain(cmd);
    }
  });

  it('should be installable via maintenance setup-skill', async () => {
    const maintenanceTsPath = path.join(__dirname, '../src/commands/maintenance.ts');
    const content = await fs.readFile(maintenanceTsPath, 'utf-8');
    
    expect(content).toContain('export async function setupSkillCommand()');
    expect(content).toContain('.agents');
    expect(content).toContain('skills');
    expect(content).toContain('deba');
  });
});
