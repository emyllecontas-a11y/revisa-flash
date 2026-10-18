// src/routes/pdf.$fileId.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/app-shell';
import { PdfViewer } from '@/components/PdfViewer';
import { getFileById, FileRecord } from '@/services/fileService';
import { getDb } from '@/lib/db';
import { useAppUser } from '@/contexts/UserContext';
import { Loader2, ChevronLeft, AlertCircle, WifiOff } from 'lucide-react';

export default function PdfPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { user } = useAppUser();

  const [file, setFile] = useState<FileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineNoCache, setOfflineNoCache] = useState(false);

  useEffect(() => {
    if (!fileId || !user?.id) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      setOfflineNoCache(false);

      try {
        // 1) Tenta do banco local (RxDB) primeiro.
        // Usamos SÓ o primary key no selector: o RxDB tem um bug conhecido
        // quando o selector combina a primary key com outro campo não
        // indexado — ele gera um IDBKeyRange inválido.
        //
        // COMPARTILHAMENTO: o banco local só guarda arquivos da própria
        // usuária e os que foram compartilhados com ela (o sharedSync baixa
        // só o que a RLS libera e apaga o que deixou de ser compartilhado).
        // Por isso não exigimos mais user_id === user.id aqui.
        let localFile: FileRecord | null = null;
        try {
          const db = await getDb();
          const col = db.collections.files;
          if (col) {
            const doc = await col.findOne({ selector: { id: fileId } }).exec();
            if (doc) {
              localFile = doc.toJSON() as FileRecord;
            }
          }
        } catch (localErr) {
          console.warn('[pdf] Falha ao ler do banco local:', localErr);
        }

        if (localFile) {
          if (mounted) setFile(localFile);
          setLoading(false);
          return;
        }

        // 2) Não tem local. Se estiver offline, não tem como buscar.
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        if (!isOnline) {
          if (mounted) {
            setOfflineNoCache(true);
            setError('Este PDF nunca foi aberto neste dispositivo. Conecte-se à internet para abri-lo pela primeira vez.');
          }
          setLoading(false);
          return;
        }

        // 3) Busca do Supabase (a RLS libera arquivo próprio ou compartilhado).
        const f = await getFileById(fileId, user.id);
        if (!mounted) return;

        if (!f) {
          setError('Arquivo não encontrado ou sem acesso.');
          setLoading(false);
          return;
        }

        // 4) Salva no RxDB para uso offline futuro.
        // Checa existência primeiro para evitar CONFLICT.
        try {
          const db = await getDb();
          const col = db.collections.files;
          if (col) {
            const existing = await col.findOne({ selector: { id: f.id } }).exec();
            if (!existing) {
              await col.insert({
                ...f,
                updated_at: f.created_at,
              });
            }
          }
        } catch (saveErr) {
          console.warn('[pdf] Não foi possível salvar metadados localmente:', saveErr);
        }

        setFile(f);
      } catch (e: any) {
        if (mounted) {
          const msg = e?.message || 'Erro ao carregar o arquivo.';
          if (
            msg.includes('autenticado') ||
            msg.includes('network') ||
            msg.includes('fetch')
          ) {
            setError('Sem conexão com a internet.');
          } else {
            setError(msg);
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [fileId, user?.id]);

  if (loading) {
    return (
      <AppShell breadcrumb="Leitor de PDF" title="Carregando…">
        <div className="flex flex-col items-center gap-3 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-foreground/60">Buscando o arquivo…</p>
        </div>
      </AppShell>
    );
  }

  if (error || !file) {
    return (
      <AppShell breadcrumb="Leitor de PDF" title="Erro">
        <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          {offlineNoCache ? (
            <WifiOff className="mx-auto h-8 w-8 text-destructive" />
          ) : (
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          )}
          <p className="mt-3 text-sm text-destructive">{error || 'Arquivo não encontrado.'}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium text-foreground/70 hover:bg-surface-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell breadcrumb={`Conteúdo · ${file.disciplina}`} title={file.nome}>
      <div className="mx-auto max-w-5xl">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/55 hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar ao tópico
        </button>

        <PdfViewer url={file.url} fileId={file.id} />
      </div>
    </AppShell>
  );
}