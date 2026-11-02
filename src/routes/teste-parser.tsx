// src/routes/teste-parser.tsx
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import {
  extrairQuestoesDePdf,
  extrairTextoBruto,
  type QuestaoParsed,
} from '@/services/pdfBancoParser';

export default function TesteParserPage() {
  const [resultado, setResultado] = useState<QuestaoParsed[] | null>(null);
  const [textoBruto, setTextoBruto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [fileRef, setFileRef] = useState<File | null>(null);

  const onSelect = (file: File) => {
    setFileRef(file);
    setNome(file.name);
    setResultado(null);
    setTextoBruto(null);
    setErro(null);
  };

  const handleExtrair = async () => {
    if (!fileRef) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await extrairQuestoesDePdf(fileRef);
      if (res.success && res.questoes) setResultado(res.questoes);
      else setErro(res.erro || 'Erro desconhecido');
    } catch (e: any) {
      setErro(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const handleVerTexto = async () => {
    if (!fileRef) return;
    setLoading(true);
    setErro(null);
    try {
      const t = await extrairTextoBruto(fileRef);
      setTextoBruto(t);
    } catch (e: any) {
      setErro(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell breadcrumb="Teste" title="Teste do Parser de PDF">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rf-card p-4 space-y-3">
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSelect(f);
              e.target.value = '';
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          {fileRef && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExtrair}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Extrair questões
              </button>
              <button
                onClick={handleVerTexto}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground/70 hover:bg-surface-2 disabled:opacity-50"
              >
                Ver texto bruto (debug)
              </button>
            </div>
          )}
          {loading && <p className="text-sm text-foreground/60">Processando...</p>}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        {textoBruto && (
          <div className="rf-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Texto bruto extraído de <span className="text-primary">{nome}</span>
              </h2>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(textoBruto).catch(() => {});
                }}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-foreground/70 hover:bg-surface-2"
              >
                Copiar
              </button>
            </div>
            <p className="text-xs text-foreground/50">
              Copie este texto e cole na conversa com a IA para ajustar o parser.
            </p>
            <textarea
              readOnly
              value={textoBruto}
              rows={20}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground/80"
            />
          </div>
        )}

        {resultado && (
          <div className="rf-card p-4">
            <h2 className="text-sm font-semibold mb-3">
              {resultado.length} questão(ões) em <span className="text-primary">{nome}</span>
            </h2>
            <div className="space-y-2">
              {resultado.map((q, i) => (
                <details key={i} className="rounded-lg border border-border bg-surface/40 p-3">
                  <summary className="cursor-pointer text-xs font-semibold">
                    Q{q.__numero} — {q.banca} {q.ano} — {q.disciplina} —{' '}
                    {q.tipo_questao === 'multipla_escolha' ? 'Múltipla' : 'C/E'}
                    {q.__warnings.length > 0 && (
                      <span className="ml-2 text-warning">⚠ {q.__warnings.length}</span>
                    )}
                  </summary>
                  <div className="mt-3 space-y-1.5 text-xs">
                    <p><b>Banca:</b> {q.banca}</p>
                    <p><b>Cargo:</b> {q.cargo || '—'}</p>
                    <p><b>Concurso/Órgão:</b> {q.concurso || '—'}</p>
                    <p><b>Ano:</b> {q.ano || '—'}</p>
                    <p><b>Disciplina:</b> {q.disciplina}</p>
                    <p><b>Assunto:</b> {q.assunto || '—'}</p>
                    <p><b>URL:</b> {q.url_origem || '—'}</p>
                    <p>
                      <b>Enunciado:</b> {q.enunciado.slice(0, 400)}
                      {q.enunciado.length > 400 ? '…' : ''}
                    </p>
                    {q.alternativas && (
                      <div>
                        <b>Alternativas:</b>
                        <ul className="mt-1 ml-4 space-y-0.5">
                          {q.alternativas.map((a) => (
                            <li key={a.letra} className={a.correta ? 'text-primary font-semibold' : ''}>
                              ({a.letra}) {a.texto.slice(0, 120)}
                              {a.texto.length > 120 ? '…' : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {q.tipo_questao === 'certo_errado' && (
                      <p><b>Gabarito:</b> {q.gabarito_ce ? 'Certo' : 'Errado'}</p>
                    )}
                    {q.gabarito_letra && <p><b>Gabarito:</b> {q.gabarito_letra}</p>}
                    <p className="text-foreground/50"><b>Hash:</b> {q.hash_dedup}</p>
                    {q.__warnings.length > 0 && (
                      <div className="mt-2 rounded border border-warning/30 bg-warning/10 p-2 text-warning">
                        <b>Avisos:</b>
                        <ul className="mt-1 ml-4">
                          {q.__warnings.map((w, j) => <li key={j}>• {w}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}