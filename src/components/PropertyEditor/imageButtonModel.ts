import type { ImageButtonProps, ImageButtonState } from '../../types';

let fallbackStateSequence = 0;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeImageButtonStateValue(
  value: unknown,
  fallback = 0,
): number {
  const integer = Math.trunc(finiteNumber(value, fallback));
  return Math.max(0, Math.min(65535, integer));
}

export function normalizeImageButtonStates(value: unknown): ImageButtonState[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is Record<string, unknown> => (
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    ))
    .map((entry, index) => ({
      ...entry,
      id: typeof entry.id === 'string' && entry.id
        ? entry.id
        : `state-${index + 1}`,
      name: typeof entry.name === 'string' && entry.name
        ? entry.name
        : `State ${index + 1}`,
      imageId: typeof entry.imageId === 'string' ? entry.imageId : '',
      value: normalizeImageButtonStateValue(entry.value, index),
    }));
}

export function clampImageButtonStateIndex(
  index: unknown,
  stateCount: number,
): number {
  if (stateCount <= 0) return 0;
  const integer = Math.trunc(finiteNumber(index, 0));
  return Math.max(0, Math.min(stateCount - 1, integer));
}

export function getImageButtonState(
  states: ImageButtonState[],
  index: unknown,
): ImageButtonState | undefined {
  if (states.length === 0) return undefined;
  return states[clampImageButtonStateIndex(index, states.length)];
}

export function getNextImageButtonStateIndex(
  states: ImageButtonState[],
  currentIndex: unknown,
): number {
  if (states.length <= 1) return 0;
  return (
    clampImageButtonStateIndex(currentIndex, states.length) + 1
  ) % states.length;
}

export function createImageButtonState(
  existingStates: ImageButtonState[],
): ImageButtonState {
  fallbackStateSequence += 1;
  const generatedId = globalThis.crypto?.randomUUID?.()
    ?? `state-${Date.now()}-${fallbackStateSequence}`;
  const ordinal = existingStates.length + 1;

  return {
    id: generatedId,
    name: `State ${ordinal}`,
    imageId: '',
    value: normalizeImageButtonStateValue(ordinal - 1),
  };
}

export function normalizeImageButtonProps(
  props: Partial<ImageButtonProps> | Record<string, unknown>,
): ImageButtonProps {
  const states = normalizeImageButtonStates(props.states);
  const initialState = clampImageButtonStateIndex(
    props.initialState,
    states.length,
  );
  const currentState = clampImageButtonStateIndex(
    props.currentState,
    states.length,
  );

  return {
    states,
    initialState,
    currentState,
    value: getImageButtonState(states, currentState)?.value
      ?? finiteNumber(props.value, 0),
    cycleOnClick: props.cycleOnClick !== false,
  };
}
