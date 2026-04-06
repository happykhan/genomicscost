import { useTranslation } from 'react-i18next'

const CX = 90
const CY = 90
const OUTER_R = 74
const INNER_R = 46

function polarToXY(angleDeg: number, r: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function slicePath(startDeg: number, endDeg: number): string {
  const sweep = Math.min(endDeg - startDeg, 359.999)
  const end = startDeg + sweep
  const s = polarToXY(startDeg, OUTER_R)
  const e = polarToXY(end, OUTER_R)
  const si = polarToXY(startDeg, INNER_R)
  const ei = polarToXY(end, INNER_R)
  const large = sweep > 180 ? 1 : 0
  return [
    `M ${s.x.toFixed(2)} ${s.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`,
    `L ${ei.x.toFixed(2)} ${ei.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 ${large} 0 ${si.x.toFixed(2)} ${si.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

export interface DonutSlice {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  title: string
  data: DonutSlice[]
  centerText: string
  /** Optional custom value formatter for the legend. Defaults to integer USD. */
  formatValue?: (n: number) => string
}

export default function DonutChart({ title, data, centerText, formatValue }: DonutChartProps) {
  const { t } = useTranslation()
  const nonZero = data.filter(d => d.value > 0)
  const total = nonZero.reduce((s, d) => s + d.value, 0)

  const fmtVal = formatValue ?? (n => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)

  if (total === 0) {
    return (
      <div className="card p-4" style={{ minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--gx-text-muted)', textAlign: 'center', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--gx-text-muted)' }}>—</div>
      </div>
    )
  }

  let cumDeg = 0
  const slices = nonZero.map(d => {
    const startDeg = cumDeg
    cumDeg += (d.value / total) * 360
    return { ...d, startDeg, endDeg: cumDeg }
  })

  return (
    <div className="card p-4">
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--gx-text)', marginBottom: 10, lineHeight: 1.35 }}>{title}</div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* SVG donut */}
        <div style={{ flexShrink: 0 }}>
          <svg viewBox="0 0 180 180" width="130" height="130">
            {slices.map((s, i) => (
              <path key={i} d={slicePath(s.startDeg, s.endDeg)} fill={s.color} />
            ))}
            <text x={CX} y={CY - 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--gx-text)">
              {centerText}
            </text>
            <text x={CX} y={CY + 11} textAnchor="middle" fontSize="8.5" fill="var(--gx-text-muted)">
              {t('label_total')}
            </text>
          </svg>
        </div>
        {/* Legend */}
        <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.67rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: 1, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--gx-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
              <span style={{ color: 'var(--gx-text-muted)', flexShrink: 0 }}>{fmtVal(s.value)}</span>
              <span style={{ color: 'var(--gx-text-muted)', flexShrink: 0, width: 28, textAlign: 'right' }}>
                {Math.round(s.value / total * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
