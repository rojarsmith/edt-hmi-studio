import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEditorStore } from '../../../store/editorStore';
import { NEXT_LANGUAGE } from '../../../types';
import EventEditDialog from '../EventEditDialog';

function setLanguages(languages: { code: string; name: string }[]) {
  useEditorStore.setState({
    screens: [{ id: 's1', name: 'Screen 1', components: [], backgroundColor: '#fff' }],
    currentScreenId: 's1',
    languages,
    texts: [],
  });
}

/** Open the dialog and choose the Switch Language action. */
function openWithLanguageAction() {
  const onSave = vi.fn();
  render(<EventEditDialog event={null} isCreating onSave={onSave} onClose={vi.fn()} />);
  fireEvent.change(screen.getByDisplayValue('Navigate to Screen'), { target: { value: 'setLanguage' } });
  return onSave;
}

describe('EventEditDialog — Switch Language', () => {
  beforeEach(() => {
    setLanguages([
      { code: 'en', name: 'English' },
      { code: 'zh-TW', name: '繁體中文' },
    ]);
  });

  it('offers the action alongside the others', () => {
    render(<EventEditDialog event={null} isCreating onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Switch Language' })).toBeInTheDocument();
  });

  it('lists cycling first, then every project language', () => {
    openWithLanguageAction();
    expect(screen.getByRole('option', { name: 'Next language (cycle)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English (en)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '繁體中文 (zh-TW)' })).toBeInTheDocument();
  });

  it('saves cycling without the author choosing anything', () => {
    // One button that toggles is the common case, so it is the default
    const onSave = openWithLanguageAction();
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ action: { type: 'setLanguage', language: NEXT_LANGUAGE } }),
    );
  });

  it('saves the chosen language code, not its editor name', () => {
    const onSave = openWithLanguageAction();
    fireEvent.change(screen.getByDisplayValue('Next language (cycle)'), { target: { value: 'zh-TW' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ action: { type: 'setLanguage', language: 'zh-TW' } }),
    );
  });

  it('says where to add languages when the project has none', () => {
    setLanguages([]);
    openWithLanguageAction();
    expect(screen.getByText(/no languages yet/i)).toBeInTheDocument();
  });

  it('says cycling has nowhere to go with a single language', () => {
    setLanguages([{ code: 'en', name: 'English' }]);
    openWithLanguageAction();
    expect(screen.getByText(/only one language/i)).toBeInTheDocument();
  });

  it('reopens an existing event on the language it was saved with', () => {
    render(
      <EventEditDialog
        event={{
          id: 'e1',
          eventType: 'LV_EVENT_CLICKED',
          handlerType: 'builtin',
          action: { type: 'setLanguage', language: 'zh-TW' },
        }}
        isCreating={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('繁體中文 (zh-TW)')).toBeInTheDocument();
  });
});
