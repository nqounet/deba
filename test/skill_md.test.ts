import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SKILL.md consistency', () => {
  it('should contain all major commands', async () => {
    const skillMdPath = path.join(__dirname, '../SKILL.md');
    const skillMd = await fs.readFile(skillMdPath, 'utf-8');

    // SKILL.md に記載されているべき主要コマンド
    const requiredCommands = [
      'deba run',
      'deba plan',
      'deba review',
      'deba skills',
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
