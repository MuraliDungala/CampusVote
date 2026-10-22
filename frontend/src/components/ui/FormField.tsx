import React from 'react';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  error,
  helperText,
  required,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          {label}
          {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
        </label>
      </div>

      {children}

      {error ? (
        <p className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};
