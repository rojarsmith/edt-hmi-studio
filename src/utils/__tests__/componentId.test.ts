import { describe, it, expect } from 'vitest';
import { commitComponentId, sanitizeComponentId } from '../componentId';

describe('sanitizeComponentId', () => {
  it('takes whitespace off both ends', () => {
    expect(sanitizeComponentId('  Button_1  ')).toBe('Button_1');
    expect(sanitizeComponentId('\tButton_1\n')).toBe('Button_1');
  });

  it('turns a run in the middle into the separator ids already use', () => {
    expect(sanitizeComponentId('Start Button')).toBe('Start_Button');
    expect(sanitizeComponentId('Start   Button')).toBe('Start_Button');
    expect(sanitizeComponentId('a b c')).toBe('a_b_c');
  });

  it('leaves an id that is already one alone', () => {
    expect(sanitizeComponentId('Circle_1')).toBe('Circle_1');
  });
});

describe('commitComponentId', () => {
  it('keeps the previous id when the edit leaves nothing', () => {
    // A widget with no id has no variable to generate and nothing to bind to
    expect(commitComponentId('   ', 'Circle_1')).toBe('Circle_1');
    expect(commitComponentId('', 'Circle_1')).toBe('Circle_1');
  });

  it('takes the sanitised id otherwise', () => {
    expect(commitComponentId(' Start Button ', 'Circle_1')).toBe('Start_Button');
  });
});
