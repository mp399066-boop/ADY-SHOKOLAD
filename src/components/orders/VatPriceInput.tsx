'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/Input';
import { typedToStored, storedToTyped } from '@/lib/vat-entry';

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  /** Price in the order's stored convention. */
  value: number;
  onChange: (stored: number) => void;
  /** Stored → typed multiplier (vatEntryFactor). 1 = plain field. */
  factor: number;
  /** Shown under the field when a conversion happens, e.g. "לפני מע״מ". */
  storedLabel?: string;
};

// Price field that lets the user type on a different VAT basis than the one
// the order stores. Keeps its own text while focused so typing "10." isn't
// rewritten mid-keystroke; re-syncs from the stored value otherwise.
export function VatPriceInput({ value, onChange, factor, storedLabel, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => String(storedToTyped(value, factor)));

  useEffect(() => {
    if (!focused) setText(String(storedToTyped(value, factor)));
  }, [value, factor, focused]);

  return (
    <div>
      <Input
        {...rest}
        type="number"
        value={text}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
        onChange={e => {
          setText(e.target.value);
          onChange(typedToStored(Number(e.target.value), factor));
        }}
      />
      {factor !== 1 && storedLabel && value !== 0 && (
        <p className="text-[11px] mt-0.5" style={{ color: '#9B7A5A' }}>
          נשמר: ₪{Math.abs(value).toFixed(2)} {storedLabel}
        </p>
      )}
    </div>
  );
}
