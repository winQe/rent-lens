import { clsx } from 'clsx';

/** Ten dots, `filled` of them coloured: "7 in 10". Decorative; the text next to it carries the meaning. */
export function Dots({ filled }: { filled: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: always ten dots in the same order, so the index is the identity.
        <span key={i} className={clsx('size-4.5 rounded-full', i < filled ? 'bg-plum' : 'bg-dot')} />
      ))}
    </div>
  );
}
