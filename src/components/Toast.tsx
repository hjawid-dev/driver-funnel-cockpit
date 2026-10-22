import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck } from 'lucide-react';

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = useCallback((msg: string) => {
    setMessage(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 4500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, notify, dismiss: () => setMessage(null) };
}

export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  return (
    <div aria-live="polite" role="status" className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 pointer-events-none">
      {message && (
        <button
          type="button"
          onClick={onDismiss}
          className="anim-rise pointer-events-auto flex items-center gap-2 rounded-lg bg-navy px-4 py-3 text-sm text-white shadow-lg max-w-md text-left"
        >
          <CircleCheck size={18} className="text-green shrink-0" aria-hidden />
          {message}
        </button>
      )}
    </div>
  );
}
