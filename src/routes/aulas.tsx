import { Outlet } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AulasDataProvider, useAulasData } from "@/components/aulas-redesign/AulasDataContext";
import { VideosOfflineDialog } from "@/components/aulas-redesign/VideosOfflineDialog";

function formatarDataPtBR(isoString: string | null): string {
  if (!isoString) return "";
  const data = new Date(isoString);
  return Number.isNaN(data.getTime()) ? isoString : data.toLocaleString("pt-BR");
}

// Aviso "sem conexão": aparece nas 3 telas quando a lista veio do cache offline.
function AvisoCache() {
  const { isFromCache, cacheSavedAt } = useAulasData();
  if (!isFromCache || !cacheSavedAt) return null;
  return (
    <div
      className="mb-4 flex items-center gap-2 rounded bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      role="status"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Sem conexão: mostrando a lista salva em {formatarDataPtBR(cacheSavedAt)}.</span>
    </div>
  );
}

// Esta rota é a "moldura" das 3 telas de Aulas (disciplinas, tópicos e aula).
// As telas em si entram pelo <Outlet /> (veja src/router.tsx).
export default function AulasRoute() {
  return (
    <AppShell title="Minhas Aulas" breadcrumb="Aulas">
      <AulasDataProvider>
        <AvisoCache />
        <Outlet />
        <VideosOfflineDialog />
      </AulasDataProvider>
    </AppShell>
  );
}
