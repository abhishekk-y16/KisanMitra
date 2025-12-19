import { ReactNode } from 'react';
import Button from './Button';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in">
      <span className="text-6xl mb-4 opacity-60 animate-float">{icon}</span>
      <h3 className="text-lg font-semibold text-neutral-800 mb-2">{title}</h3>
      <p className="text-sm text-neutral-500 max-w-xs mb-6">{description}</p>
      {action && (
        <Button variant="primary" size="md" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
