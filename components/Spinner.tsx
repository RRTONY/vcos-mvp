'use client'

import { FiLoader } from 'react-icons/fi'

/**
 * Small inline loading spinner. Inherits text color (currentColor) so it works
 * on both light surfaces and colored buttons. Pass a label for a "… Loading" row.
 */
export default function Spinner({
  label,
  className = '',
  size = 'w-4 h-4',
}: {
  label?: string
  className?: string
  size?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <FiLoader className={`${size} animate-spin`} aria-hidden />
      {label && <span>{label}</span>}
    </span>
  )
}
