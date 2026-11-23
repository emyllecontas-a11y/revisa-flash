import { createFileRoute, notFound } from "@tanstack/react-router";
import { TopicosLista } from "@/components/aulas-redesign/TopicosLista";
import { getDisciplina } from "@/components/aulas-redesign/mock-data";

export const Route = createFileRoute("/aulas/$disciplinaId/")({
  loader: ({ params }) => {
    const disciplina = getDisciplina(params.disciplinaId);
    if (!disciplina) throw notFound();
    return { disciplina };
  },
  head: ({ loaderData }) => {
    const t = `${loaderData?.disciplina.nome ?? "Disciplina"} · Aulas · RevisaFlash`;
    const d = "Tópicos e subtópicos da disciplina.";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] };
  },
  component: Page,
});

function Page() {
  const { disciplina } = Route.useLoaderData();
  return <TopicosLista disciplina={disciplina} />;
}
