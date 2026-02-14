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
            bg-surface-card border border-surface-border
            rounded-lg font-mono text-body-lg
            text-white placeholder:text-gray-400
            focus:outline-none focus:border-primary-500 focus:border-2 focus:text-white
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
