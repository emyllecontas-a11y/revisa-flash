// src/components/aulas/AulaMateriais.tsx
// Card "Material de Apoio": lista, anexa, abre, baixa e remove os PDFs de uma aula.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Download,
  Trash2,
  Upload,
  CheckCircle,
  WifiOff,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAulaMateriais } from "@/contexts/AulaMateriaisContext";
import { getMaterialUrl, type AulaMaterial } from "@/services/aulaMateriaisService";
import { ensureCached, getPdfBlob, hasPdfBlob } from "@/services/pdfCache";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { AULA_MATERIAIS } from "@/constants";

interface AulaMateriaisProps {
  aulaId: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace(".", ",")} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

export function AulaMateriais({ aulaId }: AulaMateriaisProps) {
  const { materiais, loading, addMaterial, removeMaterial } = useAulaMateriais();
  const confirm = useConfirm();
  const toast = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [enviando, setEnviando] = useState(false);
  const [nomeEnviando, setNomeEnviando] = useState<string | null>(null);
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [offlineIds, setOfflineIds] = useState<Record<string, boolean>>({});

  // useMemo: getByAula devolve um array novo a cada chamada, o que reexecutaria
  // o effect do cache em loop. Filtrar aqui mantém a referência estável.
  const materiaisDaAula = useMemo(
    () => materiais.filter((m) => m.aula_id === aulaId),
    [materiais, aulaId],
  );

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  // Quais PDFs já estão no cache do aparelho (selos "Offline").
  useEffect(() => {
    let cancelado = false;
    const checar = async () => {
      const pares = await Promise.all(
        materiaisDaAula.map(async (m) => [m.id, await hasPdfBlob(m.id)] as const),
      );
      if (!cancelado) setOfflineIds(Object.fromEntries(pares));
    };
    void checar();
    return () => {
      cancelado = true;
    };
  }, [materiaisDaAula]);

  const handleSelecionarArquivos = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const arquivos = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (arquivos.length === 0) return;

      setEnviando(true);
      for (const arquivo of arquivos) {
        setNomeEnviando(arquivo.name);

        if (
          arquivo.type !== AULA_MATERIAIS.MIME_TYPE &&
          !arquivo.name.toLowerCase().endsWith(".pdf")
        ) {
          toast.error(`"${arquivo.name}" não é um PDF. Use apenas arquivos .pdf.`);
          continue;
        }
        if (arquivo.size > AULA_MATERIAIS.MAX_SIZE_BYTES) {
          toast.error(
            `"${arquivo.name}" é muito grande. O limite é ${AULA_MATERIAIS.MAX_SIZE_MB} MB (este tem ${formatBytes(arquivo.size)}).`,
          );
          continue;
        }

        try {
          await addMaterial(aulaId, arquivo);
          toast.success(`"${arquivo.name}" anexado.`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro desconhecido.";
          toast.error(`Falha ao anexar "${arquivo.name}": ${msg}`);
        }
      }
      setNomeEnviando(null);
      setEnviando(false);
    },
    [aulaId, addMaterial, toast],
  );

  const handleRemover = useCallback(
    async (material: AulaMaterial) => {
      const confirmado = await confirm({
        title: `Remover ${material.nome}?`,
        description: "Essa ação não pode ser desfeita.",
        confirmText: "Remover",
        cancelText: "Cancelar",
        destructive: true,
      });
      if (!confirmado) return;

      try {
        await removeMaterial(material.id, material.storage_path);
        toast.success(`"${material.nome}" removido.`);
        setOfflineIds((prev) => {
          const next = { ...prev };
          delete next[material.id];
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido.";
        toast.error(`Falha ao remover "${material.nome}": ${msg}`);
      }
    },
    [confirm, removeMaterial, toast],
  );

  // Abre em nova aba. A aba é criada no clique (para não ser bloqueada) e recebe
  // a URL depois. O blob sai do cache quando existe; senão baixa via URL assinada
  // e aproveita para deixar o arquivo disponível offline.
  const handleAbrir = useCallback(
    async (material: AulaMaterial) => {
      const jaNoCache = !!offlineIds[material.id];

      if (!isOnline && !jaNoCache) {
        toast.error(
          "Este PDF ainda não foi baixado neste aparelho. Conecte-se à internet para abri-lo uma vez.",
        );
        return;
      }

      setAbrindoId(material.id);

      const aba = window.open("about:blank", "_blank");
      const apontar = (url: string) => {
        if (aba) aba.location.href = url;
        else window.open(url, "_blank");
      };

      try {
        const blob = await getPdfBlob(material.id);
        if (blob) {
          const url = URL.createObjectURL(blob);
          apontar(url);
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
          return;
        }

        const urlAssinada = await getMaterialUrl(material.storage_path);
        if (!urlAssinada) {
          aba?.close();
          toast.error(`Não foi possível abrir "${material.nome}".`);
          return;
        }

        apontar(urlAssinada);
        const resultado = await ensureCached(material.id, urlAssinada, material.nome);
        if (resultado.cached) {
          setOfflineIds((prev) => ({ ...prev, [material.id]: true }));
        }
      } catch (err) {
        console.error("[AulaMateriais] Erro ao abrir PDF:", err);
        aba?.close();
        toast.error(`Erro ao abrir "${material.nome}".`);
      } finally {
        setAbrindoId(null);
      }
    },
    [isOnline, offlineIds, toast],
  );

  const handleBaixar = useCallback(
    async (material: AulaMaterial) => {
      const blob = await getPdfBlob(material.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = material.nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      if (!isOnline) {
        toast.error(
          "Este PDF ainda não foi baixado neste aparelho. Conecte-se à internet para baixá-lo.",
        );
        return;
      }

      try {
        const urlAssinada = await getMaterialUrl(material.storage_path, material.nome);
        if (!urlAssinada) {
          toast.error(`Não foi possível baixar "${material.nome}".`);
          return;
        }
        const a = document.createElement("a");
        a.href = urlAssinada;
        a.download = material.nome;
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();

        const resultado = await ensureCached(material.id, urlAssinada, material.nome);
        if (resultado.cached) {
          setOfflineIds((prev) => ({ ...prev, [material.id]: true }));
        }
      } catch (err) {
        console.error("[AulaMateriais] Erro ao baixar PDF:", err);
        toast.error(`Erro ao baixar "${material.nome}".`);
      }
    },
    [isOnline, toast],
  );

  const podeAnexar = isOnline && !enviando;

  if (loading) {
    return (
      <Card className="p-5">
        <CardContent className="flex items-center gap-2 p-0 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando materiais…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border p-5">
        <CardTitle className="text-sm font-semibold">Material de Apoio</CardTitle>

        <div className="flex items-center gap-2">
          {enviando ? (
            <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground sm:inline">
              Enviando…
            </span>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!podeAnexar}
            className="min-h-[36px]"
            title={isOnline ? "Anexar PDF" : "Sem internet: não é possível anexar"}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 text-primary" />
            )}
            {enviando ? "Enviando…" : "Anexar PDF"}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleSelecionarArquivos}
            disabled={!podeAnexar}
            className="sr-only"
            aria-label="Anexar PDF"
            tabIndex={-1}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {!isOnline ? (
          <p className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-5 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            Sem internet: só é possível abrir PDFs já baixados neste aparelho.
          </p>
        ) : null}

        {enviando && nomeEnviando ? (
          <p className="border-b border-border px-5 py-2 text-xs text-muted-foreground">
            Enviando: <span className="font-medium text-foreground">{nomeEnviando}</span>
          </p>
        ) : null}

        {materiaisDaAula.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <FileText className="mx-auto h-9 w-9 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhum material anexado a esta aula ainda.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Clique em Anexar PDF para adicionar.
            </p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border">
            {materiaisDaAula.map((material) => (
              <li key={material.id} className="flex items-center gap-3 px-5 py-3">
                <span className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
                  <FileText className="h-4 w-4" />
                </span>

                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="truncate text-sm font-medium text-foreground"
                    title={material.nome}
                  >
                    {material.nome}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {formatBytes(material.tamanho)}
                    {offlineIds[material.id] ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                        <CheckCircle className="h-2.5 w-2.5" />
                        Offline
                      </span>
                    ) : null}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAbrir(material)}
                    disabled={abrindoId === material.id || (!isOnline && !offlineIds[material.id])}
                    className="min-h-[36px] px-2.5"
                    aria-label={`Abrir ${material.nome}`}
                    title="Abrir"
                  >
                    {abrindoId === material.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Abrir</span>
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBaixar(material)}
                    disabled={!isOnline && !offlineIds[material.id]}
                    className="min-h-[36px] px-2.5"
                    aria-label={`Baixar ${material.nome}`}
                    title="Baixar"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Baixar</span>
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemover(material)}
                    disabled={!isOnline}
                    className="min-h-[36px] px-2.5 text-muted-foreground hover:text-destructive"
                    aria-label={`Remover ${material.nome}`}
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Remover</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
