import { useTranslation } from 'react-i18next'

export default function About() {
  const { t } = useTranslation()

  return (
    <div style={{ background: 'var(--gx-bg)' }}>
      <main className="py-12">
        <div className="max-w-2xl mx-auto px-6">

          <h1 className="text-3xl font-light mb-2" style={{ color: 'var(--gx-text)' }}>
            {t('about_title')}
          </h1>
          <p className="text-sm mb-10" style={{ color: 'var(--gx-text-muted)' }}>
            {t('about_subtitle')}
          </p>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--gx-text)' }}>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>{t('about_what_title')}</h2>
              <p>{t('about_what_body')}</p>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>{t('about_purpose_title')}</h2>
              <p>{t('about_purpose_body')}</p>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>{t('about_how_title')}</h2>
              <p className="mb-3">{t('about_how_body1')}</p>
              <p>{t('about_how_body2')}</p>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>{t('about_limits_title')}</h2>
              <ul className="list-disc list-inside space-y-1" style={{ color: 'var(--gx-text-muted)' }}>
                <li>{t('about_limits_1')}</li>
                <li>{t('about_limits_2')}</li>
                <li>{t('about_limits_3')}</li>
                <li>{t('about_limits_4')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>{t('about_citation_title')}</h2>
              <p className="mb-3" style={{ color: 'var(--gx-text-muted)' }}>{t('about_citation_who')}</p>
              <p style={{ color: 'var(--gx-text-muted)' }}>{t('about_citation_tool')}</p>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>{t('about_author_title')}</h2>
              <p className="mb-2">{t('about_author_body')}</p>
              <a
                href="https://cgps.group"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--gx-accent)' }}
              >
                {t('about_cgps_link')}
              </a>
            </section>

            <section>
              <h2 className="text-base font-medium mb-2" style={{ color: 'var(--gx-text)' }}>{t('about_source_title')}</h2>
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
    </div>
  )
}
