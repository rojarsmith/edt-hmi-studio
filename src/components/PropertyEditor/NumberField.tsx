import React, { useState } from 'react';

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  'aria-label'?: string;
  title?: string;
  disabled?: boolean;
}

/**
 * A number input that can be typed into.
 *
 * A plain controlled `<input type="number">` cannot: half-typed text like `-`
 * or an emptied field reads back as `""`, which parses to 0, which is written
 * to the store, which re-renders the field as `0` — wiping the minus sign
 * before the digits arrive. Typing -100 was impossible; only the spinner
 * reached a negative number.
 *
 * So the keystrokes are held here while they are still being made, and the
 * store hears only about text that is actually a number. The draft is dropped
 * on blur, after which the field follows the value again.
 */
const NumberField: React.FC<NumberFieldProps> = ({ value, onChange, ...rest }) => {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="number"
      {...rest}
      value={draft ?? String(value)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        // "" is what the browser reports for a field holding nothing, and for
        // one holding something that is not yet a number — a lone minus sign,
        // say. Neither is a value anyone asked for.
        if (text === '') return;
        const parsed = Number(text);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={(e) => {
        setDraft(null);
        // An abandoned half-entry leaves the value as it was, rather than
        // silently becoming zero.
        if (e.target.value === '') e.target.value = String(value);
      }}
    />
  );
};

export default NumberField;
