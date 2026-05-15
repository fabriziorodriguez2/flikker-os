"use client";

import { useState } from "react";

interface CopyBlockProps {
  code: string;
}

export default function CopyBlock({ code }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#2c2d45] bg-[#1A1A2E] p-3">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[#E8EAF0]">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded-lg border border-[#E8EAF0]/20 px-3 py-1.5 text-xs font-semibold text-[#E8EAF0] hover:bg-white/10"
      >
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  );
}
