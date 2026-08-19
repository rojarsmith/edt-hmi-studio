// The dialog is where a name is chosen, so it is where project-wide uniqueness
// is enforced: a blank field takes the next free name, a colliding one is
// refused rather than silently renamed.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import type { Animation, LvglComponent } from '../../../types';
import AnimationEditDialog from '../AnimationEditDialog';

function anim(name: string, id = name): Animation {
  return {
    id,
    name,
    targetComponentId: 'comp-1',
    type: 'fade_in',
    easing: 'linear',
    duration: 300,
    delay: 0,
    repeat: 0,
    property: 'opa',
    startValue: 0,
    endValue: 255,
  };
}

function component(id: string, animations: Animation[]): LvglComponent {
  return {
    id,
    type: 'btn',
    name: id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    children: [],
    props: {},
    styles: { default: {} },
    events: [],
    animations,
    parentId: null,
    locked: false,
    visible: true,
  };
}

function setScreens(...components: LvglComponent[]) {
  useEditorStore.setState({
    screens: [{ id: 'screen-1', name: 'Screen 1', components, backgroundColor: '#fff' }],
    currentScreenId: 'screen-1',
    selection: { selectedIds: [], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
}

describe('AnimationEditDialog naming', () => {
  beforeEach(() => setScreens(component('comp-1', [])));

  function renderDialog(existing: Animation | null = null) {
    const saved: Animation[] = [];
    render(
      <AnimationEditDialog
        animation={existing}
        isCreating={!existing}
        targetComponentId="comp-1"
        onSave={(a) => saved.push(a)}
        onClose={() => {}}
      />,
    );
    return saved;
  }

  it('names a blank animation after its type, numbered from 1', () => {
    const saved = renderDialog();
    fireEvent.click(screen.getByText('Save'));
    expect(saved[0].name).toBe('Fade_In_1');
  });

  it('counts animations on other components when numbering', () => {
    setScreens(component('comp-1', []), component('comp-2', [anim('Fade_In_1')]));
    const saved = renderDialog();

    fireEvent.click(screen.getByText('Save'));

    expect(saved[0].name).toBe('Fade_In_2');
  });

  it('offers the name it would take as the placeholder', () => {
    renderDialog();
    expect(screen.getByLabelText('Animation Name').getAttribute('placeholder'))
      .toContain('Fade_In_1');
  });

  it('refuses a name another animation already answers to', () => {
    setScreens(component('comp-1', []), component('comp-2', [anim('Intro')]));
    const saved = renderDialog();

    fireEvent.change(screen.getByLabelText('Animation Name'), { target: { value: 'Intro' } });
    fireEvent.click(screen.getByText('Save'));

    expect(saved).toHaveLength(0);
    expect(screen.getByText('An animation named "Intro" already exists.')).toBeTruthy();
  });

  it('lets an animation keep its own name while being edited', () => {
    const existing = anim('Intro', 'id-1');
    setScreens(component('comp-1', [existing]));
    const saved = renderDialog(existing);

    fireEvent.click(screen.getByText('Save'));

    expect(saved[0].name).toBe('Intro');
  });
});
