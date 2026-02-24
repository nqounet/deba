import { describe, it, expect } from 'vitest';
import { extractAndParseYaml } from '../src/yamlParser';

describe('extractAndParseYaml', () => {
  it('Markdownのコードブロック（```yaml）から正しいYAMLを抽出してパースできるべき', () => {
    const text = `
これはいくつかのテキストです。
\`\`\`yaml
name: Test Item
value: 123
\`\`\`
さらに別のテキスト。
    `;
    const result = extractAndParseYaml(text);
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toEqual({ name: 'Test Item', value: 123 });
    expect(result.yamlRaw).toBe('name: Test Item\nvalue: 123');
  });

  it('Markdownのコードブロック（```）から正しいYAMLを抽出してパースできるべき', () => {
    const text = `
これはいくつかのテキストです。
\`\`\`
key: value
number: 456
\`\`\`
さらに別のテキスト。
    `;
    const result = extractAndParseYaml(text);
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toEqual({ key: 'value', number: 456 });
    expect(result.yamlRaw).toBe('key: value\nnumber: 456');
  });

  it('不正なYAMLを含むコードブロックの場合、エラーを返す', () => {
    const text = `
\`\`\`yaml
{ [ }
\`\`\`
    `;
    const result = extractAndParseYaml(text);
    expect(result.error).toBeDefined();
    expect(result.parsedObject).toBeNull();
    expect(result.yamlRaw).toBe('{ [ }');
  });

  it('YAMLブロックがない場合、テキスト全体をYAMLとしてパースできるべき', () => {
    const text = `
key1: value1
key2: 789
    `;
    const result = extractAndParseYaml(text);
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toEqual({ key1: 'value1', key2: 789 });
    expect(result.yamlRaw).toBe('key1: value1\nkey2: 789');
  });

  it('YAMLブロックがなく、テキスト全体が不正なYAMLの場合、エラーを返す', () => {
    const text = `
key1: value1
key2:
  - itemA: itemB: invalid
    `;
    const result = extractAndParseYaml(text);
    expect(result.error).toBeDefined();
    expect(result.parsedObject).toBeNull();
    expect(result.yamlRaw).toContain('itemA: itemB: invalid');
  });

  it('コロンを含む文字列をダブルクォーテーションで囲んで正しくパースできるべき', () => {
    const text = `
\`\`\`yaml
description: "これはコロンを含む: テスト説明です"
item_list:
  - name: "アイテム1: サブアイテム"
  - detail: |
      複数行の
      説明です。
      これもコロン: を含みます。
\`\`\`
    `;
    const result = extractAndParseYaml(text);
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toEqual({
      description: 'これはコロンを含む: テスト説明です',
      item_list: [
        { name: 'アイテム1: サブアイテム' },
        { detail: '複数行の\n説明です。\nこれもコロン: を含みます。\n' },
      ],
    });
    expect(result.yamlRaw).toContain('description: "これはコロンを含む: テスト説明です"');
  });

  it('空の入力の場合、空のオブジェクトを返す', () => {
    const text = '';
    const result = extractAndParseYaml(text);
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toBeNull();
    expect(result.yamlRaw).toBe('');
  });

  it('空白のみの入力の場合、空のオブジェクトを返す', () => {
    const text = '   \n \t ';
    const result = extractAndParseYaml(text);
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toBeNull();
    expect(result.yamlRaw).toBe('');
  });

  it('コードブロック内に空のYAMLがある場合、空のオブジェクトを返す', () => {
    const text = `\`\`\`yaml

\`\`\``;
    const result = extractAndParseYaml(text);
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toBeNull();
    expect(result.yamlRaw).toBe('');
  });

  it('閉じ記号（\`\`\`）がない不完全なブロックからデータを抽出できるべき', () => {
    const text = `
Here is the data:
\`\`\`yaml
name: Incomplete Block
status: active`;
    const result = extractAndParseYaml(text);
    // remark は閉じ記号がなくても、ファイルの末尾までをコードブロックとして扱ってくれることを期待
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toEqual({ name: 'Incomplete Block', status: 'active' });
    expect(result.yamlRaw).toBe('name: Incomplete Block\nstatus: active');
  });

  it('複数のコードブロックがある場合、最初の有効なブロックを採用するべき', () => {
    const text = `
Block 1:
\`\`\`yaml
id: 1
\`\`\`
Block 2:
\`\`\`json
{ "id": 2 }
\`\`\`
    `;
    const result = extractAndParseYaml(text);
    expect(result.parsedObject).toEqual({ id: 1 });
  });

  it('JSONと言語指定されているが実体がYAMLの場合でもパースできるべき', () => {
    const text = `
\`\`\`json
key: this_is_actually_yaml
value: 123
\`\`\`
    `;
    const result = extractAndParseYaml(text);
    expect(result.error).toBeUndefined();
    expect(result.parsedObject).toEqual({ key: 'this_is_actually_yaml', value: 123 });
  });

  it('Markdown記号自体をパースしようとせず、中身だけを抽出するべき', () => {
    // 以前問題になっていた、空のコードブロック記号自体がパース対象になってしまう問題の確認
    const text = `
テキスト
\`\`\`yaml
\`\`\`
テキスト
    `;
    const result = extractAndParseYaml(text);
    expect(result.parsedObject).toBeNull();
    expect(result.yamlRaw).toBe('');
  });
});