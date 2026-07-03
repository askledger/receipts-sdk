"use client";

import { useState } from "react";

export function HashCell({ value, ariaLabel }: { value: string; ariaLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const visible = value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard refused */
    }
  }

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-2 font-mono text-xs px-1.5 py-0.5 rounded hover:bg-black/5"
      title={value}
      aria-label={ariaLabel ?? `Copy ${value}`}
    >
      <span>{visible}</span>
      <span aria-hidden className="opacity-60 text-[10px]">{copied ? "copied" : "copy"}</span>
    </button>
  );
}
