import type { LvglComponent, Screen } from '../types';
import type {
  ModbusBinding,
  ModbusRegisterTag,
} from '../types/hmi';

export function applyTagToBinding(
  binding: ModbusBinding,
  tag: ModbusRegisterTag,
): ModbusBinding {
  return {
    ...binding,
    tagId: tag.id,
    area: tag.area,
    address: tag.address,
    dataType: tag.dataType,
    access: tag.access,
    scale: tag.scale,
    pollIntervalMs: tag.pollIntervalMs,
  };
}

export function bindingMatchesTag(
  binding: ModbusBinding,
  tag: ModbusRegisterTag,
): boolean {
  return (
    binding.tagId === tag.id
    && binding.area === tag.area
    && binding.address === tag.address
    && binding.dataType === tag.dataType
    && binding.access === tag.access
    && binding.scale === tag.scale
    && binding.pollIntervalMs === tag.pollIntervalMs
  );
}

function bindingsEqual(
  left: ModbusBinding,
  right: ModbusBinding,
): boolean {
  return (
    left.enabled === right.enabled
    && left.tagId === right.tagId
    && left.area === right.area
    && left.address === right.address
    && left.dataType === right.dataType
    && left.access === right.access
    && left.property === right.property
    && left.scale === right.scale
    && left.pollIntervalMs === right.pollIntervalMs
    && left.writeBehavior === right.writeBehavior
    && left.writeValue === right.writeValue
  );
}

function synchronizeComponents(
  components: LvglComponent[],
  tagsById: Map<string, ModbusRegisterTag>,
): LvglComponent[] {
  let changed = false;
  const synchronized = components.map((component) => {
    const children = synchronizeComponents(component.children, tagsById);
    let binding = component.modbusBinding;

    if (binding?.tagId) {
      const tag = tagsById.get(binding.tagId);
      binding = tag
        ? applyTagToBinding(binding, tag)
        : { ...binding, tagId: undefined };
    }

    const bindingChanged = (
      binding !== component.modbusBinding
      && binding !== undefined
      && component.modbusBinding !== undefined
      && !bindingsEqual(binding, component.modbusBinding)
    );
    if (children !== component.children || bindingChanged) {
      changed = true;
      return {
        ...component,
        children,
        ...(bindingChanged ? { modbusBinding: binding } : {}),
      };
    }
    return component;
  });

  return changed ? synchronized : components;
}

/**
 * Updates every tag-backed binding while retaining reference identity for
 * screens and component subtrees that did not change.
 */
export function synchronizeModbusBindings(
  screens: Screen[],
  tags: ModbusRegisterTag[],
): Screen[] {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  let changed = false;
  const synchronized = screens.map((screen) => {
    const components = synchronizeComponents(screen.components, tagsById);
    if (components !== screen.components) {
      changed = true;
      return { ...screen, components };
    }
    return screen;
  });
  return changed ? synchronized : screens;
}
