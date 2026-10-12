// src/routes/teste-pdf.tsx
import { AppShell } from '@/components/app-shell';
import { PdfViewer } from '@/components/PdfViewer';

// PDF público de exemplo (Mozilla)
const PDF_TESTE =
  'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

export default function TestePdfPage() {
  return (
    <AppShell breadcrumb="Teste" title="Teste do Leitor de PDF">
      <div className="mx-auto max-w-4xl">
        <PdfViewer url={PDF_TESTE} />
      </div>
    </AppShell>
  );
}