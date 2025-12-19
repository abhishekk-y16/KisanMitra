import { ReactNode } from 'react';

interface TapButtonProps {
  icon: string | ReactNode;
  label: string;
  sublabel?: string;
  description?: string;
  badge?: string;
  small?: boolean;
  variant?: 'default' | 'primary' | 'success' | 'warning';
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}

export function TapButton({ 
  icon, 
  label, 
  sublabel, 
  description,
  badge,
  small, 
  variant = 'default',
  disabled = false,
  loading = false,
  onClick 
}: TapButtonProps) {
  const variantStyles = {
    default: 'hover:border-neutral-300 hover:bg-neutral-50',
    primary: 'border-primary-200 bg-primary-50/50 hover:border-primary-300 hover:bg-primary-50',
    success: 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 hover:bg-emerald-50',
    warning: 'border-amber-200 bg-amber-50/50 hover:border-amber-300 hover:bg-amber-50',
  };

  const iconBgStyles = {
    default: 'bg-neutral-100 text-neutral-600 group-hover:bg-neutral-200',
    primary: 'bg-primary-100 text-primary-600 group-hover:bg-primary-200',
    success: 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200',
    warning: 'bg-amber-100 text-amber-600 group-hover:bg-amber-200',
  };

  if (small) {
    return (
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className={`
          group relative
          min-h-[72px] min-w-[72px]
          p-3
          flex flex-col items-center justify-center gap-1.5
          bg-white border border-neutral-200 rounded-2xl
          transition-all duration-200
          hover:border-neutral-300 hover:shadow-md hover:-translate-y-0.5
          active:scale-[0.98]
          disabled:opacity-50 disabled:pointer-events-none
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        `}
      >
        <span className={`
          w-10 h-10 flex items-center justify-center
          rounded-xl text-xl
          ${iconBgStyles[variant]}
          transition-colors duration-200
        `}>
          {loading ? (
            <svg className="w-5 h-5 animate-spin text-current" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : icon}
        </span>
        <span className="text-xs font-medium text-neutral-700">{label}</span>
        {sublabel && (
          <span className="text-[10px] text-neutral-400">{sublabel}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        group relative w-full
        p-5
        flex items-start gap-4
        bg-white border border-neutral-200 rounded-2xl
        text-left
        transition-all duration-200
        ${variantStyles[variant]}
        hover:shadow-lg hover:-translate-y-0.5
        active:scale-[0.99]
        disabled:opacity-50 disabled:pointer-events-none
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
      `}
    >
      {/* Icon Container */}
      <div className={`
        flex-shrink-0
        w-14 h-14 flex items-center justify-center
        rounded-2xl text-2xl
        ${iconBgStyles[variant]}
        transition-colors duration-200
      `}>
        {loading ? (
          <svg className="w-6 h-6 animate-spin text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : icon}
      </div>

      {/* Text Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-neutral-900">{label}</h3>
          {badge && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
              {badge}
            </span>
          )}
        </div>
        {sublabel && (
          <p className="text-sm text-neutral-500 mt-0.5">{sublabel}</p>
        )}
        {description && (
          <p className="text-sm text-neutral-400 mt-1.5 line-clamp-2">{description}</p>
        )}
      </div>

      {/* Arrow indicator */}
      <div className="flex-shrink-0 self-center">
        <svg 
          className="w-5 h-5 text-neutral-400 group-hover:text-neutral-600 group-hover:translate-x-0.5 transition-all duration-200" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
