import React from 'react';
import { getInitials, generateAvatarColor } from '@/utils/helpers';

interface AvatarProps {
  name: string;
  id: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Avatar({ name, id, size = 'md', className = '' }: AvatarProps) {
  const sizeStyles = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
  };

  const backgroundColor = generateAvatarColor(id);

  return (
    <div 
      className={`
        rounded-full flex items-center justify-center font-medium text-white
        ${sizeStyles[size]} ${className}
      `}
      style={{ backgroundColor }}
    >
      {getInitials(name)}
    </div>
  );
}
