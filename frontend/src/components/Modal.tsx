import { ReactNode, useEffect, useCallback } from 'react';

interface ModalProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ 
  title, 
  subtitle,
  children, 
  onClose,
  footer,
  size = 'md',
}: ModalProps) {
  // Close on escape key
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [handleEscape]);

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal Container - Desktop Centered */}
      <div className="fixed inset-0 flex items-center justify-center p-4 md:p-8">
        {/* Modal Content */}
        <div 
          className={`
            relative w-full ${sizeClasses[size]}
            bg-white
            rounded-2xl
            shadow-2xl
            max-h-[90vh]
            overflow-hidden
            flex flex-col
            animate-scale-in
          `}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 px-6 py-4 border-b border-neutral-100 bg-white">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 id="modal-title" className="text-xl font-bold text-neutral-900">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="
                  flex-shrink-0 w-10 h-10
                  flex items-center justify-center
                  rounded-full
                  text-neutral-500 bg-neutral-100
                  hover:bg-neutral-200 hover:text-neutral-700
                  transition-colors duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                "
                aria-label="Close dialog"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>

          {/* Footer (optional) */}
          {footer && (
            <div className="sticky bottom-0 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
