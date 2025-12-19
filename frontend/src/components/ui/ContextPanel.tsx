import React from 'react';

interface ContextPanelProps {
  title?: string;
  children?: React.ReactNode;
}

export default function ContextPanel({ title, children }: ContextPanelProps) {
  return (
    <aside className="bg-neutral-50 border border-neutral-100 rounded-2xl p-4 shadow-sm">
      {title && <h4 className="font-semibold mb-2">{title}</h4>}
      <div className="text-sm text-neutral-600">{children}</div>
    </aside>
  );
}
