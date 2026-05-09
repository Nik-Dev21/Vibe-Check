/**
 * components/layout/footer.tsx
 * Minimal dark footer — attributions + copyright.
 * Server Component.
 */

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="mt-auto border-t"
      style={{
        borderColor: 'var(--color-border-subtle)',
        backgroundColor: 'var(--color-bg-primary)',
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
        {/* Copyright */}
        <p
          className="text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          &copy; {year}{' '}
          <span translate="no" style={{ color: 'var(--color-text-secondary)' }}>
            VibeCheck
          </span>
          {' '}— Your vibe-coded app has vulnerabilities. We found them.
        </p>

        {/* Powered-by attributions */}
        <div
          className="flex items-center gap-4 text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <span translate="no">IBM&nbsp;Granite</span>
          <span aria-hidden="true">&middot;</span>
          <span translate="no">Watson&nbsp;NLU</span>
          <span aria-hidden="true">&middot;</span>
          <span translate="no">Featherless&nbsp;AI</span>
        </div>
      </div>
    </footer>
  )
}
