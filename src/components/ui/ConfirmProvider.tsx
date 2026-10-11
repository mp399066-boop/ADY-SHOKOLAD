'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmModal } from './ConfirmModal';

// Branded, RTL replacement for window.confirm:
//   const confirm = useConfirm();
//   if (!(await confirm('למחוק את המשימה?'))) return;

interface ConfirmOptions {
  title?:        string;
  confirmLabel?: string;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ message: string; options: ConfirmOptions } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    resolver.current?.(false);
    setState({ message, options });
    return new Promise<boolean>(resolve => { resolver.current = resolve; });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        open={state !== null}
        title={state?.options.title ?? 'אישור פעולה'}
        description={state?.message ?? ''}
        confirmLabel={state?.options.confirmLabel ?? 'אישור'}
        onConfirm={() => settle(true)}
        onClose={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  // Outside the provider (e.g. a page rendered without the dashboard layout)
  // fall back to the native dialog rather than silently approving.
  return ctx ?? (async (message: string) => window.confirm(message));
}
