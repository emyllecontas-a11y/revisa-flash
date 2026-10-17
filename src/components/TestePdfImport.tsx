// src/components/TestePdfImport.tsx
import { useState, useEffect, useMemo } from 'react';
import { importarPdf, type ExtracaoCompleta } from '@/services/pdfImportService';
import type { ParseResult } from '@/services/parseQuestoesPdf';
import { marcar, marcarCompleto } from '@/services/pdfExtracaoAvancada';
import { Loader2 } from 'lucide-react';

export function TestePdfImport() {
  const [extraindo, setExtraindo] = useState(false);
  const [extracao, setExtracao] = useState<ExtracaoCompleta | null>(null);
  const [resultado, setResultado] = useState<ParseResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const handleArquivo = async (file: File) => {
    setExtraindo(true);
    setErro(null);
    setExtracao(null);
    setResultado(null);
    try {
      const { extracao, resultado } = await importarPdf(file);
      setExtracao(extracao);
      setResultado(resultado);
      console.log('===== EXTRAÇÃO =====', extracao);
      console.log('===== RESULTADO =====', resultado);
    } catch (e: any) {
      setErro(e?.message || String(e));
      console.error(e);
    } finally {
      setExtraindo(false);
    }
  };

  const totalSublinhados = useMemo(
    () => extracao?.linhas.reduce((s, l) => s + l.sublinhados.length, 0) ?? 0,
    [extracao]
  );

  const totalNegritos = useMemo(
    () => extracao?.linhas.reduce((s, l) => s + (l.negritos?.length ?? 0), 0) ?? 0,
    [extracao]
  );

  const totalItalicos = useMemo(
    () => extracao?.linhas.reduce((s, l) => s + (l.italicos?.length ?? 0), 0) ?? 0,
    [extracao]
  );

  const linhasComFormatacao = useMemo(
    () =>
      (extracao?.linhas ?? []).filter(
        (l) =>
          l.sublinhados.length > 0 ||
          (l.negritos?.length ?? 0) > 0 ||
          (l.italicos?.length ?? 0) > 0
      ),
    [extracao]
  );

  const questoes = resultado?.questoes ?? [];
  const warnings = resultado?.warnings ?? [];

  return (
    <div className="space-y-4">
      <div className="rf-card p-5">
        <h2 className="font-display text-lg font-bold mb-1">
          🔬 Teste — Extração avançada (texto + sublinhado + negrito + imagem)
        </h2>
        <p className="text-xs text-foreground/50 mb-3">
          Escolha um PDF. Extrai texto (para o parser), linhas com formatação e imagens.
        </p>
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleArquivo(f);
            e.target.value = '';
          }}
          className="block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        />
        {extraindo && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-foreground/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Processando… (pode levar alguns segundos)
          </p>
        )}
        {erro && (
          <p className="mt-3 rounded-lg border border-accent/20 bg-accent/10 p-3 text-sm text-accent">
            {erro}
          </p>
        )}
      </div>

      {extracao && resultado && (
        <>
          <div className="rf-card p-5">
            <h3 className="font-display text-sm font-semibold mb-2">📊 Números gerais</h3>
            <ul className="text-xs text-foreground/60 space-y-1">
              <li>Páginas: <b>{extracao.totalPaginas}</b></li>
              <li>Caracteres: <b>{extracao.totalCaracteres}</b></li>
              <li>Linhas: <b>{extracao.linhas.length}</b></li>
              <li>Sublinhados: <b>{totalSublinhados}</b></li>
              <li>Negritos: <b>{totalNegritos}</b></li>
              <li>Itálicos: <b>{totalItalicos}</b></li>
              <li>Imagens: <b>{extracao.imagens.length}</b></li>
              <li>Questões (parser): <b>{questoes.length}</b></li>
              <li>Warnings: <b>{warnings.length}</b></li>
            </ul>
          </div>

          {linhasComFormatacao.length > 0 && (
            <div className="rf-card p-5">
              <h3 className="font-display text-sm font-semibold mb-2">
                ✍️ Linhas com formatação (primeiras 20)
              </h3>
              <ul className="text-xs space-y-2 max-h-96 overflow-y-auto">
                {linhasComFormatacao.slice(0, 20).map((l, i) => (
                  <li key={i} className="rounded-md border border-border bg-background/40 p-2">
                    <div
                      className="text-foreground/80 whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{
                        __html: marcarCompleto(
                          l.texto,
                          l.sublinhados,
                          l.negritos ?? [],
                          l.italicos ?? [],
                          'html'
                        ),
                      }}
                    />
                    <div className="mt-1 text-[10px] text-foreground/40">
                      pág. {l.pagina} · {l.sublinhados.length} sublinhado(s)
                      {l.negritos?.length ? ` · ${l.negritos.length} negrito(s)` : ''}
                      {l.italicos?.length ? ` · ${l.italicos.length} itálico(s)` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extracao.imagens.length > 0 && (
            <div className="rf-card p-5">
              <h3 className="font-display text-sm font-semibold mb-2">
                🖼️ Imagens extraídas ({extracao.imagens.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {extracao.imagens.slice(0, 12).map((img, i) => (
                  <MiniaturaImagem key={i} img={img} idx={i} />
                ))}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rf-card p-5">
              <h3 className="font-display text-sm font-semibold mb-2">
                ⚠️ Avisos do parser ({warnings.length})
              </h3>
              <ul className="text-xs text-foreground/60 space-y-1 max-h-60 overflow-y-auto">
                {warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniaturaImagem({ img, idx }: { img: any; idx: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(img.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [img.blob]);

  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      {url ? (
        <img
          src={url}
          alt={`Imagem ${idx + 1}`}
          className="w-full max-h-40 object-contain rounded"
        />
      ) : (
        <div className="w-full h-32 grid place-items-center text-foreground/30 text-xs">
          carregando…
        </div>
      )}
      <div className="mt-1 text-[10px] text-foreground/40 space-y-0.5">
        <div>pág. {img.pagina} · {img.largura}×{img.altura}</div>
        <div>{(img.blob.size / 1024).toFixed(0)} KB · {img.origem}</div>
      </div>
    </div>
  );
}