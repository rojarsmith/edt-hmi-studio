import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DockPanel from '../DockPanel';
import { useDeployStore } from '../../../store/deployStore';
import { useDockStore, DOCK_DEFAULT_HEIGHT } from '../../../store/dockStore';

vi.mock('../../../services/hmiApi', () => ({
  getHmiCapabilities: vi.fn(),
  getHmiImageLayout: vi.fn(),
  listHmiPorts: vi.fn(),
  buildHmiProject: vi.fn(),
  flashHmiBuild: vi.fn(),
  subscribeBuildLog: () => () => {},
}));

const toggle = () => screen.getByTitle(/panel/i);

beforeEach(() => {
  useDockStore.setState({
    expanded: true,
    activePane: 'build',
    height: DOCK_DEFAULT_HEIGHT,
  });
  useDeployStore.setState({
    busy: null,
    buildId: '',
    buildLog: [],
    flashLog: [],
    ports: [],
    capabilities: { success: true, canBuild: true, canFlash: true },
  });
});

describe('DockPanel states', () => {
  it('shows its panes and body when it is in use', () => {
    render(<DockPanel visible />);

    expect(screen.getByRole('tab', { name: 'Build Firmware' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Flash & Reset' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    expect(toggle()).toBeEnabled();
  });

  it('keeps its panes but drops the body when collapsed', () => {
    useDockStore.setState({ expanded: false });

    render(<DockPanel visible />);

    expect(screen.getByRole('tab', { name: 'Build Firmware' })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(toggle()).toBeEnabled();
  });

  it('stays in the layout as an empty strip when it is not in use', () => {
    const { container } = render(<DockPanel visible={false} />);

    // The band remains so the workspace does not jump by its height, but there
    // is nothing in it and nothing to open.
    const panel = container.querySelector('.dock-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('inert');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('will not expand from the inert strip', () => {
    useDockStore.setState({ expanded: true });

    render(<DockPanel visible={false} />);

    const button = toggle();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);

    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('gives the expanded state back when it is in use again', () => {
    // Expansion belongs to the author and is not spent by leaving the tab.
    useDockStore.setState({ expanded: true });
    const { rerender } = render(<DockPanel visible={false} />);
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();

    rerender(<DockPanel visible />);

    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('marks the pane whose operation is running', () => {
    useDeployStore.setState({ busy: 'flashing' });

    const { container } = render(<DockPanel visible />);

    const flashTab = screen.getByRole('tab', { name: /Flash & Reset/ });
    expect(flashTab.querySelector('.dock-tab-busy')).toBeInTheDocument();
    expect(container.querySelectorAll('.dock-tab-busy')).toHaveLength(1);
  });
});
