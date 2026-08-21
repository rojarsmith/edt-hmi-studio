import { describe, it, expect } from 'vitest';
import type { LvglComponent } from '../../types';
import {
  cloneStyles,
  hasStyleParts,
  isArcPart,
  partColor,
  partSelector,
  partStyle,
  widgetParts,
  withPartStyle,
  withoutPartStyle,
} from '../widgetParts';

describe('widgetParts', () => {
  it('names a part in the widget its own words', () => {
    expect(widgetParts('switch').map(p => p.label)).toEqual(['Off', 'On', 'Knob']);
    expect(widgetParts('slider').map(p => p.label)).toEqual(['Track', 'Fill', 'Knob']);
  });

  it('gives a widget with no parts of its own a single main one', () => {
    expect(widgetParts('label')).toHaveLength(1);
    expect(widgetParts('label')[0].part).toBe('main');
    expect(hasStyleParts('label')).toBe(false);
    expect(hasStyleParts('slider')).toBe(true);
  });

  it('knows which parts are drawn as arcs', () => {
    expect(isArcPart('arc', 'indicator')).toBe(true);
    expect(isArcPart('spinner', 'main')).toBe(true);
    // The handle on an arc is a real box.
    expect(isArcPart('arc', 'knob')).toBe(false);
    expect(isArcPart('slider', 'indicator')).toBe(false);
  });
});

describe('partSelector', () => {
  it('writes the main part in its default state as no selector at all', () => {
    expect(partSelector('main', 'default')).toBe('0');
  });

  it('writes a part, a state, or both', () => {
    expect(partSelector('main', 'pressed')).toBe('LV_STATE_PRESSED');
    expect(partSelector('indicator', 'default')).toBe('LV_PART_INDICATOR');
    expect(partSelector('knob', 'pressed')).toBe('LV_PART_KNOB | LV_STATE_PRESSED');
  });
});

function slider(styles: LvglComponent['styles']): Pick<LvglComponent, 'type' | 'styles'> {
  return { type: 'slider', styles };
}

describe('reading a part style', () => {
  it('reads the main part from the widget itself', () => {
    const styles = { default: { bgColor: '#111' }, pressed: { bgColor: '#222' } };
    expect(partStyle(styles, 'main')?.bgColor).toBe('#111');
    expect(partStyle(styles, 'main', 'pressed')?.bgColor).toBe('#222');
  });

  it('reads nothing for a part the widget never styled', () => {
    expect(partStyle({ default: {} }, 'knob')).toBeUndefined();
  });

  it('falls back rather than inventing a colour', () => {
    expect(partColor(slider({ default: {} }), 'indicator', '#2196F3')).toBe('#2196F3');
    expect(
      partColor(slider({ default: {}, parts: { indicator: { default: { bgColor: '#F0A94C' } } } }), 'indicator', '#2196F3'),
    ).toBe('#F0A94C');
  });

  it('reads an arc value colour from Border Color when it has no part of its own', () => {
    const arc = { type: 'arc', styles: { default: { borderColor: '#4FD1A5' } } };
    expect(partColor(arc, 'indicator', '#2196F3')).toBe('#4FD1A5');
    // A slider's fill has never meant that, so it must not start now.
    expect(partColor(slider({ default: { borderColor: '#4FD1A5' } }), 'indicator', '#2196F3')).toBe('#2196F3');
  });
});

describe('writing a part style', () => {
  it('starts a state from the default, and a part from nothing', () => {
    const styles = { default: { bgColor: '#111', borderWidth: 2 } };

    const pressed = withPartStyle(styles, 'main', 'pressed', { bgColor: '#222' });
    expect(pressed.pressed).toEqual({ bgColor: '#222', borderWidth: 2 });

    // A part inherits from the theme, not from the widget, so seeding it with
    // the widget's colours would claim a styling it does not have.
    const knob = withPartStyle(styles, 'knob', 'default', { bgColor: '#333' });
    expect(knob.parts?.knob?.default).toEqual({ bgColor: '#333' });
  });

  it('leaves the other parts and states alone', () => {
    const styles = withPartStyle(
      { default: {}, parts: { indicator: { default: { bgColor: '#aaa' } } } },
      'knob', 'default', { bgColor: '#bbb' },
    );
    expect(styles.parts?.indicator?.default?.bgColor).toBe('#aaa');
    expect(styles.parts?.knob?.default?.bgColor).toBe('#bbb');
  });

  it('clearing a part drops it entirely, and drops parts with it when it was the last', () => {
    const styles = { default: {}, parts: { knob: { default: { bgColor: '#333' } } } };
    expect(withoutPartStyle(styles, 'knob', 'default').parts).toBeUndefined();
  });

  it('clearing one state of a part keeps the others', () => {
    const styles = {
      default: {},
      parts: { knob: { default: { bgColor: '#333' }, pressed: { bgColor: '#444' } } },
    };
    const next = withoutPartStyle(styles, 'knob', 'pressed');
    expect(next.parts?.knob).toEqual({ default: { bgColor: '#333' } });
  });

  it('never clears the main part in its default state — there is nothing to fall back to', () => {
    const styles = { default: { bgColor: '#111' } };
    expect(withoutPartStyle(styles, 'main', 'default')).toBe(styles);
  });
});

describe('cloneStyles', () => {
  it('copies the part styles deeply, so an edit to the copy cannot reach the original', () => {
    const styles = {
      default: { bgColor: '#111' },
      parts: { indicator: { default: { bgColor: '#222' } } },
    };
    const copy = cloneStyles(styles);
    copy.parts!.indicator!.default!.bgColor = '#999';
    expect(styles.parts.indicator.default.bgColor).toBe('#222');
  });

  it('leaves a widget with no parts without the key', () => {
    expect(cloneStyles({ default: {} }).parts).toBeUndefined();
  });
});
