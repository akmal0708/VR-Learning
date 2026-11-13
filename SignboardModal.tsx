import { X } from 'lucide-react';
import type { SignboardContent } from '../world/types';

interface SignboardModalProps {
  sign: SignboardContent;
  onClose: () => void;
}

export function SignboardModal({ sign, onClose }: SignboardModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(8, 13, 24, 0.58)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl border border-amber-200/25 p-8 shadow-2xl"
        style={{ backgroundColor: 'rgba(17, 24, 39, 0.96)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signboard-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          aria-label="Close signboard"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-xs font-medium tracking-wider text-amber-300/85 mb-2">
          {sign.location}
        </p>
        <h2
          id="signboard-title"
          className="font-display text-2xl font-semibold text-slate-50 mb-4 pr-8"
        >
          {sign.title}
        </h2>
        <div className="h-px w-full bg-white/10 mb-4" />
        <p className="text-[15px] leading-relaxed text-slate-200 mb-6">
          {sign.body}
        </p>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-950 bg-amber-300 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Continue Exploring
          </button>
        </div>
      </div>
    </div>
  );
}
