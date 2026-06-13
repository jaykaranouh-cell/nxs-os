import { useState } from "react";

/**
 * Text that clamps when long and expands on click. Shows a more/less toggle
 * only when the content actually exceeds the threshold.
 */
export function ExpandableText({
  text,
  className = "",
  clamp = "line-clamp-3",
  threshold = 140,
}: {
  text: string;
  className?: string;
  clamp?: string;
  threshold?: number;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold;
  return (
    <div>
      <p className={`${className} ${open || !long ? "" : clamp}`}>{text}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 text-[9px] font-mono text-primary/60 hover:text-primary transition-colors"
        >
          {open ? "less ▲" : "more ▾"}
        </button>
      )}
    </div>
  );
}
