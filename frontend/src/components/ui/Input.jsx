import { forwardRef } from 'react';
import { cn } from '../../utils/cn';

export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300',
        'placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none',
        invalid && 'ring-red-500 focus:ring-red-500',
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300',
        'focus:ring-2 focus:ring-indigo-600 focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
