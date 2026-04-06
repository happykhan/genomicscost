import { useState, useRef, useEffect } from 'react'

interface TooltipProps {
  content: string
}

export default function Tooltip({ content }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!visible) return
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [visible])

  return (
    <span
      ref={ref}
      style={{ display: 'inline-block', position: 'relative', verticalAlign: 'middle', marginLeft: 4 }}
    >
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={e => { e.preventDefault(); setVisible(v => !v) }}
        aria-label="Help"
        aria-expanded={visible}
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          border: '1px solid var(--gx-text-muted)',
          background: 'none',
          cursor: 'pointer',
          color: 'var(--gx-text-muted)',
          fontSize: '9px',
          fontWeight: 700,
          lineHeight: 1,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--gx-bg)',
            border: '1px solid var(--gx-border)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: '0.73rem',
            color: 'var(--gx-text)',
            width: 250,
            zIndex: 300,
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            lineHeight: 1.5,
            fontWeight: 400,
            textTransform: 'none',
            letterSpacing: 'normal',
            pointerEvents: 'none',
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
