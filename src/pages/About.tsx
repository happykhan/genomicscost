import { AppFooter } from '@genomicx/ui'

export default function About() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--gx-bg)' }}>
      <main className="flex-1 py-12">
        <div className="max-w-2xl mx-auto px-6">

          <h1 className="text-3xl font-light mb-2" style={{ color: 'var(--gx-text)' }}>
            About this tool
          </h1>
          <p className="text-sm mb-10" style={{ color: 'var(--gx-text-muted)' }}>
            Genomics Costing Tool — web edition
          </p>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--gx-text)' }}>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>What is this?</h2>
              <p>
                An independent, open-source web app for estimating genomic surveillance
                laboratory costs. It implements the same calculation methodology as the{' '}
                <strong>WHO Genomics Costing Tool, 2nd edition (2026)</strong> — but is not
                affiliated with, endorsed by, or produced by the World Health Organization.
                The original tool is a Microsoft Excel spreadsheet; this version provides the
                same calculations through a guided, mobile-friendly interface.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>Purpose</h2>
              <p>
                The tool estimates the cost of establishing and running a genomic surveillance
                laboratory, including sequencing platforms, reagents, equipment, personnel,
                facility, bioinformatics, and quality management. It is intended for
                policymakers, lab leaders, health economists, and donor institutions planning
                or scaling genomic surveillance programmes.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>How it works</h2>
              <p className="mb-3">
                The tool walks you through 7 steps: lab setup, sequencing platform, consumables,
                equipment, personnel, facility and bioinformatics, and results. All calculations
                run in your browser — no data is sent to any server.
              </p>
              <p>
                The samples-per-run calculation follows the methodology in Annex 2 of the WHO
                user manual: reads per sample are derived from genome size × coverage, compared
                against pathogen-type minimum read thresholds, buffered for off-target reads,
                and constrained by the barcoding limit of the selected library prep kit.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>Limitations</h2>
              <ul className="list-disc list-inside space-y-1" style={{ color: 'var(--gx-text-muted)' }}>
                <li>Reagent and equipment prices are reference prices from the WHO Excel (2026) and may not reflect local pricing.</li>
                <li>The tool costs one sequencing platform at a time (the Excel supports two simultaneously).</li>
                <li>Library kit compatibility is not automatically validated — consult manufacturer documentation.</li>
                <li>Establishment cost excludes personnel, reagents, and facility costs.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>Citation</h2>
              <p style={{ color: 'var(--gx-text-muted)' }}>
                World Health Organization (2026). Genomics costing tool, 2nd ed. World Health
                Organization.{' '}
                <a
                  href="https://doi.org/10.2471/B09722"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--gx-accent)' }}
                >
                  https://doi.org/10.2471/B09722
                </a>
                . Licence: CC BY-NC-SA 3.0 IGO.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>Source code</h2>
              <p>
                <a
                  href="https://github.com/happykhan/genomicscost"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--gx-accent)' }}
                >
                  github.com/happykhan/genomicscost
                </a>
              </p>
            </section>

          </div>
        </div>
      </main>
      <AppFooter appName="Genomics Costing Tool" />
    </div>
  )
}
