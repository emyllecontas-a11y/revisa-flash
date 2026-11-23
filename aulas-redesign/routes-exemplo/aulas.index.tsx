import { createFileRoute } from "@tanstack/react-router";
import { DisciplinasGrid } from "@/components/aulas-redesign/DisciplinasGrid";

export const Route = createFileRoute("/aulas/")({
  head: () => ({
    meta: [
      { title: "Minhas aulas · RevisaFlash" },
      { name: "description", content: "Escolha uma disciplina e assista às aulas." },
      { property: "og:title", content: "Minhas aulas · RevisaFlash" },
      { property: "og:description", content: "Escolha uma disciplina e assista às aulas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DisciplinasGrid,
});
