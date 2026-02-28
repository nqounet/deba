import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '../src/templates');

const REQUIRED_TEMPLATES = [
  {
    name: 'phase_a',
    placeholders: [
      '{{USER_REQUEST}}',
      '{{PROJECT_SUMMARY}}',
      '{{TARGET_SOURCE_CODE}}',
      '{{SEMANTIC_MEMORY}}',
      '{{RELATED_EPISODES}}',
      '{{DEPENDENCY_INTERFACES}}'
    ]
  },
  {
    name: 'phase_b',
    placeholders: ['{{STEP_DESCRIPTION}}', '{{TARGET_FILE_CONTENT}}', '{{CAUTIONS}}']
  },
  {
    name: 'reflection',
    placeholders: ['{{EPISODE_SUMMARY}}', '{{USER_CORRECTIONS}}', '{{CURRENT_SKILLS}}']
  },
  {
    name: 'skill_suggestion',
    placeholders: ['{{TASK_DESCRIPTION}}', '{{TASK_RESULT}}']
  },
  {
    name: 'ingestion',
    placeholders: ['{{FILE_TREE}}', '{{CONTEXT_FILES}}']
  },
  {
    name: 'maintenance',
    placeholders: ['{{CONTENT}}']
  },
  {
    name: 'repair',
    placeholders: ['{{ERROR_DETAIL}}']
  }
];

describe('Template Consistency Test', () => {
  REQUIRED_TEMPLATES.forEach(({ name, placeholders }) => {
    it(`template "${name}.md" should exist and contain required placeholders`, async () => {
      const filePath = path.join(TEMPLATES_DIR, `${name}.md`);
      
      // ファイルの存在確認
      await expect(fs.access(filePath)).resolves.toBeUndefined();
      
      const content = await fs.readFile(filePath, 'utf-8');
      
      // H1 タイトルから始まっていることを確認 (緩やかなチェック)
      expect(content.trim().startsWith('# ')).toBe(true);
      
      // プレースホルダーの存在確認
      placeholders.forEach(placeholder => {
        expect(content).toContain(placeholder);
      });
    });
  });

  it('should not have unexpected templates without tests (optional)', async () => {
    const files = await fs.readdir(TEMPLATES_DIR);
    const templateNames = files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    const testNames = REQUIRED_TEMPLATES.map(t => t.name);
    
    templateNames.forEach(name => {
      expect(testNames).toContain(name);
    });
  });
});
