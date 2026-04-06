import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { calculateCosts } from '../lib/calculations'
import { fmt, fmtCurrency } from '../lib/format'
import type { Project } from '../types'

interface Props {
  project: Project
  /** Current cost per sample (pre-computed to avoid re-calc) */
  costPerSample: number
}

const W = 380
const H = 210
const PAD = { top: 20, right: 24, bottom: 46, left: 56 }
const PW = W - PAD.left - PAD.right
const PH = H - PAD.top - PAD.bottom

const MULTIPLIERS = [0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]

export default function ThroughputCurve({ project, costPerSample }: Props) {
  const { t } = useTranslation()
  const { samplesPerYear } = project

  const points = useMemo(() => {
    if (samplesPerYear <= 0) return []
    return MULTIPLIERS.map(m => {
      const v = Math.max(1, Math.round(samplesPerYear * m))
      return { x: v, y: calculateCosts({ ...project, samplesPerYear: v }).costPerSample }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samplesPerYear, project.sequencers, project.equipment, project.personnel,
      project.facility, project.transport, project.bioinformatics, project.qms,
      project.consumables])

  if (!points.length || samplesPerYear <= 0 || costPerSample <= 0) return null

  const xMin = points[0].x
  const xMax = points[points.length - 1].x
  const yMax = Math.max(...points.map(p => p.y)) * 1.18
  const yMin = 0

  const toPixX = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * PW
  const toPixY = (y: number) => PAD.top + PH - ((y - yMin) / (yMax - yMin)) * PH

  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${toPixX(p.x).toFixed(1)} ${toPixY(p.y).toFixed(1)}`
  ).join(' ')

  const curX = toPixX(samplesPerYear)
  const curY = toPixY(costPerSample)

  // 4 y-axis ticks (evenly spaced)
  const yTicks = [0, 1, 2, 3, 4].map(i => (yMax / 4) * i)

  // x-axis labels: first, current, last + a couple in between
  const xLabelIdxs = [0, 2, 5, 8, 12]
  const xLabels = xLabelIdxs.map(i => points[i]).filter(Boolean)

  // Position the current-value label above or below the dot based on space
  const labelY = curY - 10 < PAD.top + 6 ? curY + 16 : curY - 10

  return (
    <div className="card p-4">
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--gx-text)', marginBottom: 6, lineHeight: 1.3 }}>
        {t('chart_throughput_curve')}
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
            textAnchor="end" fontSize="8.5" fill="var(--gx-text-muted)">
            ${fmt(tick)}
          </text>
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PH}
          stroke="var(--gx-border)" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + PH} x2={PAD.left + PW} y2={PAD.top + PH}
          stroke="var(--gx-border)" strokeWidth="1" />

        {/* X-axis labels */}
        {xLabels.map((p, i) => (
          <text key={i}
            x={toPixX(p.x)} y={PAD.top + PH + 13}
            textAnchor="middle" fontSize="8" fill="var(--gx-text-muted)">
            {p.x >= 1000 ? `${(p.x / 1000).toFixed(1)}k` : p.x}
          </text>
        ))}

        {/* Current volume dashed line */}
        <line
          x1={curX} y1={PAD.top}
          x2={curX} y2={PAD.top + PH}
          stroke="var(--gx-accent)" strokeWidth="1" strokeDasharray="4 2" opacity="0.5"
        />

        {/* Curve */}
        <path d={pathD} fill="none" stroke="var(--gx-accent)" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Current point dot */}
        <circle cx={curX} cy={curY} r="5" fill="var(--gx-accent)" />
        <circle cx={curX} cy={curY} r="3" fill="var(--gx-bg)" />
        <circle cx={curX} cy={curY} r="1.5" fill="var(--gx-accent)" />

        {/* Current value label */}
        <text x={curX + 8} y={labelY}
          fontSize="8.5" fill="var(--gx-accent)" fontWeight="700">
          ${fmtCurrency(costPerSample, 2)}
        </text>
        <text x={curX + 8} y={labelY + 10}
          fontSize="7.5" fill="var(--gx-text-muted)">
          {t('label_current')}
        </text>

        {/* Axis titles */}
        <text x={PAD.left + PW / 2} y={H - 4}
          textAnchor="middle" fontSize="8.5" fill="var(--gx-text-muted)">
          {t('label_samples_per_yr')}
        </text>
        <text
          x={10} y={PAD.top + PH / 2}
          textAnchor="middle" fontSize="8.5" fill="var(--gx-text-muted)"
          transform={`rotate(-90, 10, ${PAD.top + PH / 2})`}
        >
          {t('label_cost_per_sample')} (USD)
        </text>
      </svg>
    </div>
  )
}
