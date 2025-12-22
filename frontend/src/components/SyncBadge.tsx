import { useEffect, useState } from 'react';
import mergeClasses from '../lib/mergeClasses';

interface SyncBadgeProps {
  status: 'synced' | 'pending' | 'error' | 'offline';
  count?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function SyncBadge({ 
  status, 
  count, 
  showLabel = true,
  size = 'md',
}: SyncBadgeProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  // Pulse animation when status changes to synced
  useEffect(() => {
    if (status === 'synced') {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const statusConfig = {
    synced: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      icon: 'text-emerald-500',
      label: 'Synced',
      labelHi: 'सिंक हो गया',
    },
    pending: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      icon: 'text-amber-500',
      label: count ? `${count} pending` : 'Syncing',
      labelHi: 'सिंक हो रहा है',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: 'text-red-500',
      label: 'Sync failed',
      labelHi: 'सिंक विफल',
    },
    offline: {
      bg: 'bg-neutral-100',
      border: 'border-neutral-200',
      text: 'text-neutral-600',
      icon: 'text-neutral-400',
      label: 'Offline',
      labelHi: 'ऑफ़लाइन',
    },
  };

  const config = statusConfig[status];
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-2.5 py-1.5 text-sm gap-1.5',
  };

  const iconClasses = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  const renderIcon = () => {
    switch (status) {
      case 'synced':
        return (
          <svg className={`${iconClasses} ${config.icon}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'pending':
        return (
          <svg className={`${iconClasses} ${config.icon} animate-spin`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        );
      case 'error':
        return (
          <svg className={`${iconClasses} ${config.icon}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'offline':
        return (
          <svg className={`${iconClasses} ${config.icon}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
          </svg>
        );
    }
  };

  return (
    <span
      className={mergeClasses(
        'inline-flex items-center',
        sizeClasses[size],
        config.bg,
        config.border,
        config.text,
        'border rounded-full font-medium transition-all duration-300',
        isAnimating ? 'scale-110' : 'scale-100'
      )}
      role="status"
      aria-live="polite"
    >
      {renderIcon()}
      {showLabel && (
        <span className="flex items-center gap-1">
          <span>{config.label}</span>
          <span className="text-[10px] opacity-70 hidden sm:inline">| {config.labelHi}</span>
        </span>
      )}
    </span>
  );
}
