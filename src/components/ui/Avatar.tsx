// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React from "react";
import { getInitials, generateAvatarColor } from "@/utils/helpers";

interface AvatarProps {
  name: string;
  id: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function Avatar({ name, id, size = "md", className = "" }: AvatarProps) {
  const sizeStyles = {
    sm: "w-10 h-10 text-sm",
    md: "w-14 h-14 text-base",
    lg: "w-20 h-20 text-xl",
    xl: "w-28 h-28 text-3xl",
  };

  const backgroundColor = generateAvatarColor(id);

  return (
    <div
      className={`
        rounded-full flex items-center justify-center font-medium text-white shadow-lg
        ${sizeStyles[size]} ${className}
      `}
      style={{ backgroundColor }}
    >
      {getInitials(name)}
    </div>
  );
}
