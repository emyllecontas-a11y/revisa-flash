import { AppShell } from "@/components/app-shell";
import { AulasPage } from "@/components/aulas/AulasPage";

export default function AulasRoute() {
  return (
    <AppShell title="Minhas Aulas" breadcrumb="Aulas">
      <AulasPage />
    </AppShell>
  );
}