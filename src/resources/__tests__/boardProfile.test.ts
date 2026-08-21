import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearBoardImage,
  getBoardImage,
  getBoardSummary,
  hasBoardSummaryOverride,
  setBoardSummary,
} from '../boardProfile';
import { getBoardDefinition } from '../../types/hmi';

const board = getBoardDefinition('edt-evk043027b');

describe('board summary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to the definition when nothing is stored', () => {
    expect(getBoardSummary(board)).toBe(board.summary);
    expect(hasBoardSummaryOverride(board.id)).toBe(false);
  });

  it('prefers what the installation stored', () => {
    setBoardSummary(board.id, 'Line A, fitted with the CAN transceiver.');
    expect(getBoardSummary(board)).toBe('Line A, fitted with the CAN transceiver.');
    expect(hasBoardSummaryOverride(board.id)).toBe(true);
  });

  it('treats an emptied box as "use the built-in text"', () => {
    setBoardSummary(board.id, 'something');
    setBoardSummary(board.id, '');
    expect(getBoardSummary(board)).toBe(board.summary);
    expect(hasBoardSummaryOverride(board.id)).toBe(false);
  });

  it('does not treat whitespace as an override', () => {
    setBoardSummary(board.id, '   ');
    expect(getBoardSummary(board)).toBe(board.summary);
    expect(hasBoardSummaryOverride(board.id)).toBe(false);
  });

  it('keeps each board separate', () => {
    setBoardSummary('edt-evk043027b', 'edt text');
    expect(hasBoardSummaryOverride('stm32f746g-disco')).toBe(false);
    expect(getBoardSummary(getBoardDefinition('stm32f746g-disco')))
      .toBe(getBoardDefinition('stm32f746g-disco').summary);
  });
});

describe('board image', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is absent until one is stored, and clears back to absent', () => {
    expect(getBoardImage(board.id)).toBeNull();
    localStorage.setItem(`edt-hmi-studio.board-image.${board.id}`, 'data:image/jpeg;base64,AAA');
    expect(getBoardImage(board.id)).toBe('data:image/jpeg;base64,AAA');
    clearBoardImage(board.id);
    expect(getBoardImage(board.id)).toBeNull();
  });
});

describe('board identity', () => {
  it('separates the full name from the model number', () => {
    // The picker reads back the name and is scanned by the model, so the two
    // must not be the same string.
    for (const id of ['stm32f746g-disco', 'stm32h747i-disco', 'edt-evk043027b'] as const) {
      const definition = getBoardDefinition(id);
      expect(definition.name).not.toBe(definition.model);
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.model.length).toBeGreaterThan(0);
      expect(definition.summary.length).toBeGreaterThan(0);
    }
  });
});
