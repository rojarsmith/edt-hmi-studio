import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DockPanel from '../DockPanel';
import { useDeployStore } from '../../../store/deployStore';
import { useDockStore, DOCK_DEFAULT_HEIGHT } from '../../../store/dockStore';
import { useWorkStore } from '../../../store/workStore';

vi.mock('../../../services/hmiApi', () => ({
  getHmiCapabilities: vi.fn(),
  getHmiImageLayout: vi.fn(),
  listHmiPorts: vi.fn(),
  buildHmiProject: vi.fn(),
  flashHmiBuild: vi.fn(),
  cancelHmiBuild: vi.fn(),
  subscribeBuildLog: () => () => {},
}));

const toggle = () => screen.getByTitle(/the panel/i);

beforeEach(() => {
  useDockStore.setState({
    expanded: true,
    activePane: 'work',
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
  useWorkStore.setState({ items: [], nextId: 1 });
});

describe('DockPanel', () => {
  it('offers all three panes, with Work first', () => {
    render(<DockPanel />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Work', 'Build Firmware', 'Flash & Reset']);
  });

  it('is available whatever the workspace is showing', () => {
    // Work lists operations that outlive the tab they were started from, so
    // the dock is never tab-specific and its chevron is never dead.
    render(<DockPanel />);

    expect(toggle()).toBeEnabled();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('keeps its strip but drops the body when collapsed', () => {
    useDockStore.setState({ expanded: false });

    const { container } = render(<DockPanel />);

    expect(container.querySelector('.dock-panel')).toHaveClass('collapsed');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('expands and collapses from the chevron', () => {
    useDockStore.setState({ expanded: false });
    render(<DockPanel />);

    fireEvent.click(toggle());
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();

    fireEvent.click(toggle());
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('lights the lamp only while something is running', () => {
    const { container, rerender } = render(<DockPanel />);
    expect(container.querySelector('.dock-running-lamp')).not.toBeInTheDocument();

    useDeployStore.setState({ busy: 'building' });
    rerender(<DockPanel />);
    const lamp = container.querySelector('.dock-running-lamp');
    expect(lamp).toBeInTheDocument();
    expect(lamp).toHaveAttribute('aria-label', 'Build Firmware is running');

    useDeployStore.setState({ busy: null });
    rerender(<DockPanel />);
    expect(container.querySelector('.dock-running-lamp')).not.toBeInTheDocument();
  });

  it('shows the lamp while collapsed, which is the case it exists for', () => {
    useDockStore.setState({ expanded: false });
    useDeployStore.setState({ busy: 'flashing' });

    const { container } = render(<DockPanel />);

    expect(container.querySelector('.dock-running-lamp')).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });
});
