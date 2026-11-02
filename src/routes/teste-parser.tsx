// src/routes/teste-parser.tsx
// TEMPORÁRIO: para validar a extração de PDFs. Remover depois.
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { extrairQuestoesDePdf, type QuestaoParsed } from '@/services/pdfBancoParser';

export default function TesteParserPage() {
  const [resultado, setResultado] = useState<QuestaoParsed[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');

  const handleFile = async (file: File) => {
    setLoading(true);
    setErro(null);
    setResultado(null);
    setNome(file.name);
    try {
      const res = await extrairQuestoesDePdf(file);
      if (res.success && res.questoes) setResultado(res.questoes);
      else setErro(res.erro || 'Erro desconhecido');
    } catch (e: any) {
      setErro(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell breadcrumb="Teste" title="Teste do Parser de PDF">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rf-card p-4">
          <label className="block text-xs font-medium text-foreground/70 mb-2">
            Envie um PDF exportado do TEC Concursos
          </label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          {loading && <p className="mt-2 text-sm text-foreground/60">Processando...</p>}
          {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}
        </div>

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
                      <span className="ml-2 text-warning">⚠ {q.__warnings.length} aviso(s)</span>
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
                    <p><b>Enunciado:</b> {q.enunciado.slice(0, 300)}{q.enunciado.length > 300 ? '...' : ''}</p>
                    {q.alternativas && (
                      <div>
                        <b>Alternativas:</b>
                        <ul className="mt-1 ml-4 space-y-0.5">
                          {q.alternativas.map((a) => (
                            <li key={a.letra} className={a.correta ? 'text-primary font-semibold' : ''}>
                              ({a.letra}) {a.texto.slice(0, 100)}{a.texto.length > 100 ? '...' : ''}
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