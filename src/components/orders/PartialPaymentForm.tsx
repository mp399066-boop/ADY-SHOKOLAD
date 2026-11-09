'use client';

// "The customer paid part of it" — records how much was paid so the open debt
// shows only the balance. Amount in shekels as the customer paid it.
import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';

const METHODS = ['מזומן', 'כרטיס אשראי', 'העברה בנקאית', 'bit', 'PayBox', 'PayPal', 'המחאה', 'אחר'];

interface Props {
  balance: number;
  busy?: boolean;
  onSave: (amount: number, method: string) => void;
  onCancel?: () => void;
}

export function PartialPaymentForm({ balance, busy, onSave, onCancel }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('מזומן');
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= balance + 0.01;

  return (
    <div className="mt-3 rounded-lg p-3 space-y-2" style={{ backgroundColor: '#FFF8EC', border: '1px solid #EED9B4' }}>
      <p className="text-xs font-semibold" style={{ color: '#6B4A2D' }}>
        רישום תשלום · יתרה לתשלום {formatCurrency(balance)}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="סכום ששולם"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-32 px-2 py-1.5 text-sm rounded-lg border bg-white"
          style={{ borderColor: '#D8CCBA' }}
          aria-label="סכום ששולם"
        />
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="px-2 py-1.5 text-sm rounded-lg border bg-white"
          style={{ borderColor: '#D8CCBA' }}
          aria-label="אמצעי תשלום"
        >
          {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {amount && !valid && (
        <p className="text-[11px]" style={{ color: '#B91C1C' }}>הסכום צריך להיות בין 0 ליתרה לתשלום</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => onSave(+value.toFixed(2), method)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: '#8B5E34' }}
        >
          {busy ? '...' : 'רישום תשלום'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: '#6B4A2D' }}>
            ביטול
          </button>
        )}
      </div>
    </div>
  );
}
