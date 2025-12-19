import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  className?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ label, className = '', ...props }, ref) => {
  return (
    <div className={`flex flex-col ${className}`}>
      {label && <label className="text-sm text-neutral-700 mb-1">{label}</label>}
      <input ref={ref} className="border rounded-md px-3 py-2 text-sm bg-white" {...props} />
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
