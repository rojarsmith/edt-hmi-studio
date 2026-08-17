// Built-in project gallery: demos every user sees, plus factory-mode-only
// test projects. Opening an entry always imports a fresh copy into the user's
// own list — demos themselves are immutable app assets.
//
// Demo project files live in /examples at the repo root (they double as
// documentation there); import.meta.glob bundles them lazily so the list page
// pays nothing until the Demos tab is opened.

import type { ProjectFile } from '../resources/types';
import { buildFactoryWidgetTest } from './factoryWidgetTest';

export interface DemoEntry {
  id: string;
  name: string;
  description: string;
  /** Only listed while factory engineer development mode is unlocked. */
  factoryOnly: boolean;
  load: () => Promise<ProjectFile>;
}

const exampleFiles = import.meta.glob('/examples/*.json') as Record<
  string,
  () => Promise<{ default: ProjectFile }>
>;

async function loadExample(path: string): Promise<ProjectFile> {
  const loader = exampleFiles[path];
  if (!loader) {
    throw new Error(`Demo project file not found: ${path}`);
  }
  return (await loader()).default;
}

export const DEMO_PROJECTS: DemoEntry[] = [
  {
    id: 'f746-modbus-hmi',
    name: 'STM32F746G-DISCO Modbus HMI',
    description:
      'Modbus RTU dashboard for the F746 Discovery: live register readout, slider-driven writes and connection status.',
    factoryOnly: false,
    load: () => loadExample('/examples/f746-modbus-hmi.json'),
  },
  {
    id: 'factory-widget-exerciser',
    name: 'Factory Widget Exerciser',
    description:
      'Internal test project: one of every basic widget on a single screen, for display and touch bring-up.',
    factoryOnly: true,
    load: async () => buildFactoryWidgetTest(),
  },
];
