import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeployLogPane from '../DeployLogPane';
import { useDeployStore } from '../../../store/deployStore';

const mocks = vi.hoisted(() => ({
  buildHmiProject: vi.fn(),
  flashHmiBuild: vi.fn(),
  getHmiCapabilities: vi.fn(),
  getHmiImageLayout: vi.fn(),
  listHmiPorts: vi.fn(),
}));

vi.mock('../../../services/hmiApi', () => ({
  getHmiCapabilities: mocks.getHmiCapabilities,
  getHmiImageLayout: mocks.getHmiImageLayout,
  listHmiPorts: mocks.listHmiPorts,
  buildHmiProject: mocks.buildHmiProject,
  flashHmiBuild: mocks.flashHmiBuild,
}));

function setLog(pane: 'build' | 'flash', lines: string[]) {
  useDeployStore.setState(pane === 'build' ? { buildLog: lines } : { flashLog: lines });
}

beforeEach(() => {
  vi.clearAllMocks();
  useDeployStore.setState({
    busy: null,
    buildId: '',
    artifactUrl: '',
    layout: null,
    buildLog: [],
    flashLog: [],
    ports: [],
    capabilities: { success: true, canBuild: true, canFlash: true },
    boardId: 'stm32f746g-disco',
    protocol: 'modbus-rtu',
    runtimePort: '',
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
});

describe('DeployLogPane log controls', () => {
  it('copies every log entry in display order and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    setLog('build', ['first', 'second', 'third']);

    render(<DeployLogPane pane="build" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy build log' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('first\nsecond\nthird'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Copied 3 log entries.',
    );
  });

  it('disables copy and clear when there are no log entries', () => {
    render(<DeployLogPane pane="build" />);

    expect(screen.getByRole('button', { name: 'Copy build log' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear build log' })).toBeDisabled();
    expect(screen.getByText('Waiting for a build...')).toBeInTheDocument();
  });

  it('reports clipboard failures without changing the displayed log', async () => {
    setLog('build', ['only entry']);

    render(<DeployLogPane pane="build" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy build log' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not copy the log.',
    );
    expect(screen.getByText('only entry')).toBeInTheDocument();
  });

  it('clears only its own pane', () => {
    setLog('build', ['build line']);
    setLog('flash', ['flash line']);

    render(<DeployLogPane pane="build" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear build log' }));

    expect(useDeployStore.getState().buildLog).toEqual([]);
    expect(useDeployStore.getState().flashLog).toEqual(['flash line']);
  });
});

describe('DeployLogPane toolbar trigger', () => {
  it('will not flash before anything has been built', () => {
    render(<DeployLogPane pane="flash" />);

    expect(screen.getByRole('button', { name: 'Flash & Reset' })).toBeDisabled();
    expect(screen.getByText('No image built yet')).toBeInTheDocument();
  });

  it('flashes the build the store is holding', async () => {
    mocks.flashHmiBuild.mockResolvedValue({ success: true, log: ['written'] });
    useDeployStore.setState({ buildId: 'build-42' });

    render(<DeployLogPane pane="flash" />);
    fireEvent.click(screen.getByRole('button', { name: 'Flash & Reset' }));

    await waitFor(() =>
      expect(mocks.flashHmiBuild).toHaveBeenCalledWith('build-42', undefined),
    );
    await waitFor(() =>
      expect(useDeployStore.getState().flashLog).toContain(
        'Firmware flashed and device reset.',
      ),
    );
  });
});
