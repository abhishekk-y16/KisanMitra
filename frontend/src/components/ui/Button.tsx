import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-2 
      font-semibold rounded-xl
      transition-all duration-200 ease-out
      focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
      active:scale-[0.98]
    `;

    const variants: Record<string, string> = {
      primary: `
        text-white
        bg-gradient-to-br from-primary-600 to-primary-700
        hover:from-primary-500 hover:to-primary-600 hover:shadow-lg hover:-translate-y-0.5
        focus-visible:ring-primary-500
        shadow-md
      `,
      secondary: `
        text-neutral-800 bg-white border border-neutral-200
        hover:bg-neutral-50 hover:border-neutral-300 hover:shadow-md hover:-translate-y-0.5
        focus-visible:ring-neutral-400
        shadow-sm
      `,
      ghost: `
        text-neutral-600 bg-transparent
        hover:bg-neutral-100 hover:text-neutral-800
        focus-visible:ring-neutral-400
      `,
      danger: `
        text-white
        bg-gradient-to-br from-red-500 to-red-600
        hover:from-red-400 hover:to-red-500 hover:shadow-lg hover:-translate-y-0.5
        focus-visible:ring-red-500
        shadow-md
      `,
      success: `
        text-white
        bg-gradient-to-br from-emerald-500 to-emerald-600
        hover:from-emerald-400 hover:to-emerald-500 hover:shadow-lg hover:-translate-y-0.5
        focus-visible:ring-emerald-500
        shadow-md
      `,
    };

    const sizes: Record<string, string> = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    return (
      <button
        ref={ref}
        className={`
          ${baseStyles}
          ${variants[variant]}
          ${sizes[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <LoadingSpinner size={size} />
            <span>Please wait...</span>
          </>
        ) : (
          <>
            {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
            {children}
            {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;

function LoadingSpinner({ size }: { size: 'sm' | 'md' | 'lg' }) {
  const sizeMap: Record<string, string> = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  return (
    <svg
      className={`animate-spin ${sizeMap[size]}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
