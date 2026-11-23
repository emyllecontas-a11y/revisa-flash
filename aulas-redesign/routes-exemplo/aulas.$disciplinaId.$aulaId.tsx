import { createFileRoute, notFound } from "@tanstack/react-router";
import { AulaDetalhe } from "@/components/aulas-redesign/AulaDetalhe";
import { getDisciplina } from "@/components/aulas-redesign/mock-data";

export const Route = createFileRoute("/aulas/$disciplinaId/$aulaId")({
  loader: ({ params }) => {
    const disciplina = getDisciplina(params.disciplinaId);
    const aula = disciplina?.aulas.find((a) => a.id === params.aulaId);
    if (!disciplina || !aula) throw notFound();
    return { disciplina, aula };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.aula.titulo} · ${loaderData.disciplina.nome}` : "Aula · RevisaFlash";
    const d = loaderData?.aula.descricao ?? "Aula em vídeo.";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "video.other" }, { name: "twitter:card", content: "summary_large_image" }] };
  },
  component: Page,
});

function Page() {
  const { disciplina, aula } = Route.useLoaderData();
  return <AulaDetalhe disciplina={disciplina} aula={aula} />;
}
