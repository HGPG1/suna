'use client';

import { cn } from '@/lib/utils';

interface KortixLogoProps {
  size?: number;
  variant?: 'symbol' | 'logomark';
  className?: string;
}

export function KortixLogo({ size = 24, variant = 'symbol', className }: KortixLogoProps) {
  // For logomark variant, use logomark-white.svg which is already white
  // and invert it for light mode using CSS (no JS needed)
  if (variant === 'logomark') {
    return (
      <img
        src="/hgpg-logo.png"
        alt="Home Grown Property Group"
        className={cn('flex-shrink-0', className)}
        style={{ height: `${size}px`, width: 'auto', maxWidth: '200px' }}
        suppressHydrationWarning
      />
    );
  }

  // Default symbol variant - HGPG horizontal logo
  return (
    <img
      src="/hgpg-logo.png"
      alt="Home Grown Property Group"
      className={cn('flex-shrink-0', className)}
      style={{ height: `${size}px`, width: 'auto', maxWidth: '200px' }}
      suppressHydrationWarning
    />
  );
}
