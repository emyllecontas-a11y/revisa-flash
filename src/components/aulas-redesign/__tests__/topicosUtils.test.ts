// Testes Vitest da lógica dos tópicos (slug, progresso, localizar aula)
import { describe, it, expect } from "vitest";
import { construirArvore, type AulaItem } from "../../aulas/aulasArvore";
import { resumirTopicos, localizarAula, slugTexto } from "../topicosUtils";

function aula(id: string, assunto: string, ordem: number, subassunto: string | null, concluida = false): AulaItem {
  return {
    id,
    numero: ordem,
    modulo: "Português",
    titulo: `Aula ${id}`,
    descricao: "",
    duracao: "--:--",
    tone: "laranja",
    disciplina: "Português",
    assunto,
    subassunto,
    assunto_ordem: null,
    ordem,
    created_at: `2026-01-0${ordem}T00:00:00Z`,
    concluida,
    favorita: false,
    progresso: concluida ? 100 : 0,
  };
}

const aulas = [
  aula("a", "Fonética e Fonologia", 1, null, true),
  aula("b", "Fonética e Fonologia", 2, null, false),
  aula("c", "Sintaxe", 1, "Período simples", true),
  aula("d", "Sintaxe", 2, "Período simples", true),
  aula("e", "Sintaxe", 3, "Período composto", false),
  aula("f", "Sintaxe", 4, null, false),
];

const topicos = resumirTopicos(construirArvore(aulas)[0].assuntos);

describe("slugTexto", () => {
  it("remove acentos e troca símbolos por hífen", () => {
    expect(slugTexto("Fonética e Fonologia")).toBe("fonetica-e-fonologia");
    expect(slugTexto("   ")).toBe("geral");
  });
});

describe("resumirTopicos", () => {
  it("calcula % por tópico (soltas + subtópicos)", () => {
    const fonetica = topicos.find((t) => t.slug === "fonetica-e-fonologia")!;
    expect(fonetica.total).toBe(2);
    expect(fonetica.percentual).toBe(50);
    expect(fonetica.subtopicos).toHaveLength(0);

    const sintaxe = topicos.find((t) => t.slug === "sintaxe")!;
    expect(sintaxe.total).toBe(4);
    expect(sintaxe.concluidas).toBe(2);
    expect(sintaxe.percentual).toBe(50);
    expect(sintaxe.aulasSoltas.map((a) => a.id)).toEqual(["f"]);
  });

  it("calcula % por subtópico", () => {
    const sintaxe = topicos.find((t) => t.slug === "sintaxe")!;
    const simples = sintaxe.subtopicos.find((s) => s.slug === "periodo-simples")!;
    const composto = sintaxe.subtopicos.find((s) => s.slug === "periodo-composto")!;
    expect(simples.percentual).toBe(100);
    expect(composto.percentual).toBe(0);
  });

  it("nomes que geram o mesmo slug não se misturam", () => {
    const arvore = construirArvore([aula("x", "Crase!", 1, null), aula("y", "Crase?", 1, null)]);
    const slugs = resumirTopicos(arvore[0].assuntos).map((t) => t.slug);
    expect(new Set(slugs).size).toBe(2);
  });

  it("tópico vazio dá 0% (sem dividir por zero)", () => {
    expect(resumirTopicos([{ nome: "Vazio", ordem: null, semSubassunto: [], subassuntos: [] }])[0].percentual).toBe(0);
  });
});

describe("localizarAula", () => {
  it("acha tópico e subtópico", () => {
    expect(localizarAula(topicos, { id: "e" })?.subtopico?.slug).toBe("periodo-composto");
    expect(localizarAula(topicos, { id: "a" })?.subtopico).toBeNull();
    expect(localizarAula(topicos, { id: "zzz" })).toBeNull();
  });
});
