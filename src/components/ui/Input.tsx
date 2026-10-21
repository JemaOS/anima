// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={`
            w-full h-14 px-4
            bg-[color:var(--input-bg)] border border-[color:var(--border)]
            rounded-lg font-mono text-body-lg
            text-[color:var(--foreground)] placeholder:text-[color:var(--text-subtle)]
            focus:outline-none focus:border-primary-500 focus:border-2 focus:text-[color:var(--foreground)]
            transition-all duration-150
            ${error ? "border-danger-500" : ""}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-danger-500">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
