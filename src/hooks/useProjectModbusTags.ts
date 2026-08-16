// Current project's protocol tags, for surfaces outside the Protocol tab.

import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useProjectStore } from '../store/projectStore';
import type { ModbusRegisterTag } from '../types/hmi';

/**
 * The listed project config serves most sessions; a project opened deep-linked
 * before the list loads falls back to a one-shot config fetch. Same sourcing
 * PropertyEditor established for widget bindings.
 */
export function useProjectModbusTags(): ModbusRegisterTag[] {
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const projectList = useProjectStore(state => state.projects);
  const getProjectConfig = useProjectStore(state => state.getProjectConfig);
  const [loaded, setLoaded] = useState<{
    projectId: string;
    tags: ModbusRegisterTag[];
  } | null>(null);

  const listedConfig = projectList.find(
    item => item.config.id === currentProjectId
  )?.config;

  useEffect(() => {
    let cancelled = false;
    if (!currentProjectId || listedConfig) return;
    getProjectConfig(currentProjectId).then(config => {
      if (!cancelled && config) {
        setLoaded({
          projectId: currentProjectId,
          tags: config.communication.tags.map(tag => ({ ...tag })),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentProjectId, listedConfig, getProjectConfig]);

  return (
    listedConfig?.communication.tags
    ?? (loaded?.projectId === currentProjectId ? loaded.tags : [])
  );
}
