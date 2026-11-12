import { createFileRoute } from "@tanstack/react-router";
import { AulasPage } from "@/components/aulas/AulasPage";

export const Route = createFileRoute("/aulas")({
  component: AulasPage,
});