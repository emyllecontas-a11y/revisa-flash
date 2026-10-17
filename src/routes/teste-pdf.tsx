// src/routes/teste-pdf.tsx
import { AppShell } from '@/components/app-shell';
import { PdfViewer } from '@/components/PdfViewer';
import { TestePdfImport } from '@/components/TestePdfImport';

// PDF público de exemplo (Mozilla)
const PDF_TESTE =
  'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

export default function TestePdfPage() {
  return (
    <AppShell breadcrumb="Teste" title="Teste do Leitor de PDF">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* 1. Motor de importação de PDF (novo) */}
        <TestePdfImport />

        {/* 2. Leitor de PDF (o que já existia) */}
        <div className="rf-card p-5">
          <h2 className="font-display text-lg font-bold mb-3">Leitor de PDF (teste antigo)</h2>
          <PdfViewer url={PDF_TESTE} />
        </div>
      </div>
    </AppShell>
  );
}