import { useTranslation } from 'react-i18next'
import { fmt } from '../lib/format'

interface Props {
  establishmentCost: number
  annualRunningCost: number
}

const W = 380
const H = 200
const PAD = { top: 20, right: 24, bottom: 44, left: 60 }
const PW = W - PAD.left - PAD.right
const PH = H - PAD.top - PAD.bottom
const YEARS = [1, 2, 3, 4, 5]

export default function BreakevenChart({ establishmentCost, annualRunningCost }: Props) {
  const { t } = useTranslation()

  if (annualRunningCost <= 0) return null

  // Cumulative totals per year: establishment (one-off) + running × n
  const points = YEARS.map(y => ({
    year: y,
    cumulative: establishmentCost + annualRunningCost * y,
    running: annualRunningCost * y,
    establishment: establishmentCost,
  }))

  const yMax = points[points.length - 1].cumulative * 1.15
  // Add half-bar padding on each side so year-1 bar doesn't overlap the y-axis
  const X_PAD = PW / (YEARS.length * 2)
  const toPixX = (year: number) => PAD.left + X_PAD + ((year - 1) / (YEARS.length - 1)) * (PW - X_PAD * 2)
  const toPixY = (v: number) => PAD.top + PH - (v / yMax) * PH

  // y-axis ticks
  const yTicks = [0, 1, 2, 3, 4].map(i => (yMax / 4) * i)

  // Running cost stacked bars (bottom part)
  const barW = PW / YEARS.length * 0.55

  return (
    <div className="card p-4">
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--gx-text)', marginBottom: 6, lineHeight: 1.3 }}>
        {t('chart_breakeven')}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: '0.62rem', color: 'var(--gx-text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--gx-accent)', opacity: 0.9 }} />
          {t('label_running_cost')}
        </span>
        {establishmentCost > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--gx-accent)', opacity: 0.35 }} />
            {t('label_establishment_cost')}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* Gridlines */}
        {yTicks.slice(1).map((tick, i) => (
          <line key={i}
            x1={PAD.left} y1={toPixY(tick)}
            x2={PAD.left + PW} y2={toPixY(tick)}
            stroke="var(--gx-border)" strokeWidth="0.6"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.slice(1).map((tick, i) => (
          <text key={i}
            x={PAD.left - 5} y={toPixY(tick) + 3}
            textAnchor="end" fontSize="8" fill="var(--gx-text-muted)">
            ${tick >= 1_000_000 ? `${(tick / 1_000_000).toFixed(1)}M` : tick >= 1000 ? `${(tick / 1000).toFixed(0)}k` : fmt(tick)}
          </text>
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PH}
          stroke="var(--gx-border)" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + PH} x2={PAD.left + PW} y2={PAD.top + PH}
          stroke="var(--gx-border)" strokeWidth="1" />

        {/* Stacked bars */}
        {points.map(p => {
          const cx = toPixX(p.year)
          const x = cx - barW / 2

          // Running cost bar (bottom, solid)
          const runningH = (p.running / yMax) * PH
          const runningY = toPixY(p.running)

          // Establishment cost bar (top, lighter)
          const estH = establishmentCost > 0 ? (p.establishment / yMax) * PH : 0
          const estY = toPixY(p.cumulative)

          return (
            <g key={p.year}>
              {/* Running cost */}
              <rect x={x} y={runningY} width={barW} height={runningH}
                fill="var(--gx-accent)" opacity="0.9" rx="1" />
              {/* Establishment cost stacked on top */}
              {establishmentCost > 0 && (
                <rect x={x} y={estY} width={barW} height={estH}
                  fill="var(--gx-accent)" opacity="0.35" rx="1" />
              )}
              {/* Year label */}
              <text x={cx} y={PAD.top + PH + 12}
                textAnchor="middle" fontSize="8.5" fill="var(--gx-text-muted)">
                {t('label_year_n', { n: p.year })}
              </text>
              {/* Total label on top of bar */}
              <text x={cx} y={estY - 3}
                textAnchor="middle" fontSize="7.5" fill="var(--gx-accent)" fontWeight="600">
                ${p.cumulative >= 1_000_000
                  ? `${(p.cumulative / 1_000_000).toFixed(2)}M`
                  : p.cumulative >= 1000
                    ? `${(p.cumulative / 1000).toFixed(0)}k`
                    : fmt(p.cumulative)
                }
              </text>
            </g>
          )
        })}

        {/* Axis titles */}
        <text x={PAD.left + PW / 2} y={H - 4}
          textAnchor="middle" fontSize="8.5" fill="var(--gx-text-muted)">
          {t('label_year')}
        </text>
        <text
          x={10} y={PAD.top + PH / 2}
          textAnchor="middle" fontSize="8.5" fill="var(--gx-text-muted)"
          transform={`rotate(-90, 10, ${PAD.top + PH / 2})`}
        >
          {t('label_cumulative_cost')} (USD)
        </text>
      </svg>
    </div>
  )
}
