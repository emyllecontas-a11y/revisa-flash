// src/components/aulas-redesign/VideosOfflineDialog.tsx
//
// Janela "Vídeos offline": lista os vídeos baixados neste aparelho, mostra o espaço usado
// e permite remover. Mesma lógica do antigo AulasPage.tsx.

import { useEffect, useState } from "react";
import { AlertTriangle, Database, HardDrive, Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  listOfflineVideos,
  getStorageInfo,
  removeVideo,
  clearAllVideos,
} from "@/services/videoOfflineService";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatBytes } from "@/utils/helpers";
import { useAulasData } from "./AulasDataContext";

type InfoArmazenamento = Awaited<ReturnType<typeof getStorageInfo>>;

export function VideosOfflineDialog() {
  const { videosOfflineAberto, setVideosOfflineAberto, setOfflineAulaIds } = useAulasData();
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(false);
  const [lista, setLista] = useState<{ aulaId: string; title: string; size: number }[]>([]);
  const [info, setInfo] = useState<InfoArmazenamento>({
    usage: 0,
    quota: 0,
    persisted: false,
    supported: false,
  } as InfoArmazenamento);

  // Ao abrir a janela, carrega a lista e o espaço usado.
  useEffect(() => {
    if (!videosOfflineAberto) return;
    let cancelado = false;
    setLoading(true);
    Promise.all([listOfflineVideos(), getStorageInfo()]).then(([videos, storage]) => {
      if (cancelado) return;
      setLista(videos.map((v) => ({ aulaId: v.aulaId, title: v.title, size: v.totalBytes })));
      setInfo(storage);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [videosOfflineAberto]);

  return (
    <Dialog open={videosOfflineAberto} onOpenChange={setVideosOfflineAberto}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Vídeos offline
          </DialogTitle>
          <DialogDescription>
            Gerencie os vídeos baixados neste aparelho. Eles ficam disponíveis para assistir sem
            internet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-secondary p-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Espaço usado</p>
                <p className="font-semibold">{formatBytes(info.usage)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cota do navegador</p>
                <p className="font-semibold">{info.quota ? formatBytes(info.quota) : "Desconhecida"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Armazenamento</p>
                <p className={`font-semibold ${info.persisted ? "text-green-600" : "text-amber-600"}`}>
                  {info.persisted ? "Permanente" : "Temporário"}
                </p>
              </div>
            </div>
            {!info.persisted && info.supported && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={async () => {
                  try {
                    await navigator.storage.persist();
                    setInfo(await getStorageInfo());
                    toast.success("Armazenamento permanente solicitado");
                  } catch {
                    toast.error("Não foi possível solicitar armazenamento permanente");
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Pedir armazenamento permanente
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando…</span>
            </div>
          ) : lista.length === 0 ? (
            <div className="text-center py-8">
              <Database className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">Nenhum vídeo baixado neste aparelho.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lista.map((video) => (
                <div
                  key={video.aulaId}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{video.title}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(video.size)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: "Remover vídeo do aparelho?",
                        description: "Você pode baixá-lo de novo depois.",
                        confirmText: "Remover",
                        cancelText: "Cancelar",
                        destructive: true,
                      });
                      if (confirmed) {
                        await removeVideo(video.aulaId);
                        setLista((prev) => prev.filter((v) => v.aulaId !== video.aulaId));
                        setOfflineAulaIds((prev) => {
                          const next = new Set(prev);
                          next.delete(video.aulaId);
                          return next;
                        });
                        setInfo(await getStorageInfo());
                        toast.success("Vídeo removido");
                      }
                    }}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Remover</span>
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full mt-2 text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={async () => {
                  const confirmed = await confirm({
                    title: "Remover TODOS os vídeos offline?",
                    description:
                      "Esta ação não pode ser desfeita. Todos os vídeos baixados serão apagados do aparelho.",
                    confirmText: "Remover todos",
                    cancelText: "Cancelar",
                    destructive: true,
                  });
                  if (confirmed) {
                    await clearAllVideos();
                    setLista([]);
                    setOfflineAulaIds(new Set());
                    setInfo(await getStorageInfo());
                    toast.success("Todos os vídeos removidos");
                  }
                }}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Remover todos ({lista.length})
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setVideosOfflineAberto(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
