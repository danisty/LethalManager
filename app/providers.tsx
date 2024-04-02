// app/providers.tsx
'use client'

import { NextUIProvider } from '@nextui-org/react';

export function Providers({children}: { children: React.ReactNode }) {
  return (
    <NextUIProvider onContextMenu={(e) => e.preventDefault()}>
      {children}
    </NextUIProvider>
  )
}