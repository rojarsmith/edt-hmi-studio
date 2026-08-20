// A node that drives a component says which one, by name: the params hold an
// id, and an id on the node face tells the reader nothing. One that resolves
// to nothing wears a LACK badge, because nothing is generated for it.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { useEditorStore } from '../../../store/editorStore';
import type { LvglComponent } from '../../../types';
import LogicNodeComponent from '../LogicNode';
import type { LogicNode } from '../types';

function component(id: string, name: string): LvglComponent {
  return {
    id,
    type: 'btn',
    name,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    children: [],
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
  };
}

function node(params: Record<string, unknown>): LogicNode {
  return {
    id: 'n1',
    type: 'screen',
    subType: 'set_property',
    label: 'Set Property',
    position: { x: 0, y: 0 },
    params,
    inputs: [],
    outputs: [],
  };
}

function show(logicNode: LogicNode) {
  render(
    <ReactFlowProvider>
      <LogicNodeComponent
        id="n1"
        type="logicNode"
        data={{ logicNode } as never}
        selected={false}
        dragging={false}
        draggable={false}
        selectable={false}
        deletable={false}
        zIndex={0}
        isConnectable
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>,
  );
}

describe('what a node says about its component', () => {
  beforeEach(() => {
    useEditorStore.setState({
      screens: [{
        id: 's1',
        name: 'Screen 1',
        backgroundColor: '#fff',
        components: [component('comp-1', 'Start Button')],
      }],
      currentScreenId: 's1',
    });
  });

  it('names the component the id points at', () => {
    show(node({ targetComponent: 'comp-1', property: 'x' }));

    expect(screen.getByText('Target: Start Button')).toBeTruthy();
    expect(screen.queryByText('LACK')).toBeNull();
  });

  it('marks a target the project no longer has', () => {
    show(node({ targetComponent: 'comp-gone', property: 'x' }));

    expect(screen.getByText('LACK').getAttribute('title'))
      .toContain('The project has no component "comp-gone"');
  });

  it('marks a target that was never chosen', () => {
    show(node({ targetComponent: '', property: 'x' }));

    expect(screen.getByText('LACK').getAttribute('title'))
      .toContain('No component chosen');
  });
});
