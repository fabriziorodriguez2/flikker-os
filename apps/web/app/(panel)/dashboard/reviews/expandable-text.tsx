"use client";

import { useState } from "react";

const CHAR_LIMIT = 120;

export default function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  if (text.length <= CHAR_LIMIT) {
    return <span className="text-[#1A202C]">{text}</span>;
  }

  return (
    <span className="text-[#1A202C]">
      {expanded ? text : text.slice(0, CHAR_LIMIT) + "…"}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="ml-1.5 whitespace-nowrap text-[#5C6BC0] hover:underline"
      >
        {expanded ? "Ver menos" : "Leer más"}
      </button>
    </span>
  );
}
