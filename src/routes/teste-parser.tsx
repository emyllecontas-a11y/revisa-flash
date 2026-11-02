// src/routes/teste-parser.tsx
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { useAppUser } from '@/contexts/UserContext';
import {
  extrairQuestoesDePdf,
  extrairTextoBruto,
  type QuestaoParsed,
} from '@/services/pdfBancoParser';
import { importarQuestoesNoBanco } from '@/services/bancoQuestoesService';
import { uploadImagemQuestao, fileToBase64 } from '@/services/listaService';
import { Image as ImageIcon } from 'lucide-react';

export default function TesteParserPage() {
  const { user } = useAppUser();

  const [resultado, setResultado] = useState<QuestaoParsed[] | null>(null);
  const [textoBruto, setTextoBruto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSalvar, setLoadingSalvar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [fileRef, setFileRef] = useState<File | null>(null);
  
  // NOVO: Estado para as imagens
  const [imagensFiles, setImagensFiles] = useState<File[]>([]);

  const [resultadoSalvar, setResultadoSalvar] = useState<{
    novas: number;
    jaExistentes: number;
    erros: number;
  } | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const onSelect = (file: File) => {
    setFileRef(file);
    setNome(file.name);
    setResultado(null);
    setTextoBruto(null);
    setErro(null);
    setResultadoSalvar(null);
    setErroSalvar(null);
  };

  const handleExtrair = async () => {
    if (!fileRef) return;
    setLoading(true);
    setErro(null);
    setResultadoSalvar(null);
    setErroSalvar(null);
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

  const handleSalvar = async () => {
    if (!resultado || !user?.id) return;
    setLoadingSalvar(true);
    setErroSalvar(null);
    setResultadoSalvar(null);

    try {
      // 1. Prepara o mapa de imagens selecionadas pelo usuário
      const imagensMap = new Map<string, File>();
      imagensFiles.forEach(f => imagensMap.set(f.name.toLowerCase(), f));

      // 2. Faz uma cópia das questões para poder atualizar o imagem_url
      const questoesParaSalvar = [...resultado];

      // 3. Procura e faz o upload das imagens necessárias
      for (let i = 0; i < questoesParaSalvar.length; i++) {
        const q = questoesParaSalvar[i];
        if (q.__nome_imagem) {
          const file = imagensMap.get(q.__nome_imagem.toLowerCase());
          if (file) {
            const base64 = await fileToBase64(file);
            const upload = await uploadImagemQuestao(base64, user.id);
            if (upload.success && upload.url) {
              q.imagem_url = upload.url; // Salva a URL pública do Supabase
            } else {
              console.warn(`Erro ao subir imagem ${q.__nome_imagem}:`, upload.error);
            }
          }
        }
      }

      // 4. Salva no banco
      const res = await importarQuestoesNoBanco(questoesParaSalvar, user.id);
      if (res.success) {
        setResultadoSalvar({
          novas: res.novas,
          jaExistentes: res.jaExistentes,
          erros: res.erros,
        });
      } else {
        setErroSalvar(res.error || 'Erro ao salvar.');
      }
    } catch (e: any) {
      setErroSalvar(e?.message || 'Erro');
    } finally {
      setLoadingSalvar(false);
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExtrair}
                disabled={loading || loadingSalvar}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Extrair questões (texto)
              </button>
              <button
                onClick={handleVerTexto}
                disabled={loading || loadingSalvar}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground/70 hover:bg-surface-2 disabled:opacity-50"
              >
                Ver texto bruto
              </button>
            </div>
          )}
          {loading && <p className="text-sm text-foreground/60">Processando texto...</p>}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        {textoBruto && (
          <div className="rf-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Texto bruto (pdfjs) de <span className="text-primary">{nome}</span>
              </h2>
              <button
                onClick={() => navigator.clipboard.writeText(textoBruto).catch(() => {})}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-foreground/70 hover:bg-surface-2"
              >
                Copiar
              </button>
            </div>
            <textarea
              readOnly
              value={textoBruto}
              rows={12}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground/80"
            />
          </div>
        )}

        {resultado && (
          <div className="rf-card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold">
                {resultado.length} questão(ões) em <span className="text-primary">{nome}</span>
              </h2>
            </div>

            {/* NOVO: Campo de Upload de Imagens */}
            {resultado.some(q => q.__nome_imagem) && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4" /> Imagens Necessárias
                </p>
                <p className="text-[11px] text-foreground/70 mb-2">
                  O PDF pediu imagens. Baixe-as do TEC (ou recorte do PDF) e selecione aqui para que sejam salvas junto com as questões:
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => setImagensFiles(Array.from(e.target.files || []))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            <button
              onClick={handleSalvar}
              disabled={loadingSalvar || !user?.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loadingSalvar ? 'Salvando...' : 'Salvar no banco'}
            </button>

            {resultadoSalvar && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
                <b>Salvo com sucesso.</b> {resultadoSalvar.novas} nova(s),{' '}
                {resultadoSalvar.jaExistentes} já existente(s),{' '}
                {resultadoSalvar.erros} erro(s).
              </div>
            )}
            {erroSalvar && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {erroSalvar}
              </p>
            )}

            <div className="space-y-2">
              {resultado.map((q, i) => (
                <details key={i} className="rounded-lg border border-border bg-surface/40 p-3">
                  <summary className="cursor-pointer text-xs font-semibold">
                    Q{q.__numero} — {q.banca} {q.ano} — {q.disciplina} —{' '}
                    {q.tipo_questao === 'multipla_escolha' ? 'Múltipla' : 'C/E'}
                    {q.__nome_imagem && <span className="ml-2 text-warning">(Contém Imagem)</span>}
                  </summary>
                  <div className="mt-3 space-y-1.5 text-xs">
                    <p><b>Banca:</b> {q.banca}</p>
                    <p><b>Cargo:</b> {q.cargo || '—'}</p>
                    <p><b>Ano:</b> {q.ano || '—'}</p>
                    <p><b>Disciplina:</b> {q.disciplina}</p>
                    <p><b>Matéria:</b> {q.assunto || '—'}</p>
                    <p><b>Assunto:</b> {q.subassunto || '—'}</p>
                    <p><b>URL:</b> {q.url_origem || '—'}</p>
                    {q.__nome_imagem && (
                      <p className="text-warning font-semibold">
                        <b>Imagem:</b> {q.__nome_imagem} (Lembre-se de selecionar esta imagem!)
                      </p>
                    )}
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
                    {q.gabarito_letra && <p><b>Gabarito:</b> {q.gabarito_letra}</p>}
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