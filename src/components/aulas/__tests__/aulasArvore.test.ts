// src/components/aulas/__tests__/aulasArvore.test.ts
// Testes Vitest para a lógica da árvore de aulas (formatação, ordenação, achatamento)

import { describe, it, expect } from "vitest";
import {
  formatarAula,
  construirArvore,
  achatarArvore,
  primeiraAulaId,
  type AulaBase,
} from "../aulasArvore";
import type { Aula } from "@/services/aulaService";

// ============================================================
// HELPERS DE TESTE
// ============================================================

type AulaFake = AulaBase & Aula & {
  // Aula from aulaService already includes all required fields (id, user_id, titulo, descricao, terabox_url, created_at, disciplina?, assunto?, subassunto?, assunto_ordem?, ordem?)
  // AulaBase adds disciplina, assunto, subassunto, assunto_ordem, ordem, created_at as required
  // This intersection ensures all fields from both types are present
};

function aula(
  id: string,
  disciplina: string,
  assunto: string,
  ordem: number,
  extra: Partial<AulaFake> = {}
): AulaFake {
  return {
    id,
    user_id: "u1",
    titulo: `Titulo ${id}`,
    descricao: "",
    terabox_url: "http://video",
    created_at: `2026-01-${String(ordem).padStart(2, "0")}T00:00:00Z`,
    disciplina,
    assunto,
    ordem,
    subassunto: null,
    assunto_ordem: null,
    ...extra,
  };
}

// ============================================================
// TESTES
// ============================================================

describe("aulasArvore - lógica pura da árvore de aulas", () => {
  // A ordem em que o "banco" devolve é propositalmente embaralhada.
  const dados = [
    aula("a3", "Português", "02 - Concordância", 3, { assunto_ordem: 2 }),
    aula("a1", "Português", "01 - Acentuação", 1, { assunto_ordem: 1 }),
    aula("a2", "Português", "01 - Acentuação", 2, { assunto_ordem: 1 }),
    aula("b1", "Português", "03 - Antiga sem ordem", 1, { assunto_ordem: null }),
    aula("c1", "Português", "04 - Crase", 1, { assunto_ordem: 4, subassunto: "  " }),
    aula("d1", "Português", "05 - Subassuntos", 1, { assunto_ordem: 5 }),
    aula("d2", "Português", "05 - Subassuntos", 2, { assunto_ordem: 5, subassunto: "Verbos" }),
    aula("d3", "Português", "05 - Subassuntos", 3, { assunto_ordem: 5, subassunto: "Verbos" }),
    aula("d4", "Português", "05 - Subassuntos", 4, { assunto_ordem: 5, subassunto: "Nomes" }),
    aula("e1", "Matemática", "01 - Equações", 1, { assunto_ordem: 1 }),
  ];

  const formatadas = dados.map((d, i) => formatarAula(d, i));
  const arvore = construirArvore(formatadas);
  const plano = achatarArvore(arvore);

  describe("Disciplinas em ordem alfabética", () => {
    it("retorna disciplinas ordenadas alfabeticamente", () => {
      expect(arvore.map((d) => d.nome)).toEqual(["Matemática", "Português"]);
    });
  });

  describe("Assuntos: assunto_ordem crescente, null no fim, desempate por nome", () => {
    const portugues = arvore.find((d) => d.nome === "Português")!;

    it("ordena assuntos por assunto_ordem (null por último)", () => {
      expect(portugues.assuntos.map((a) => a.nome)).toEqual([
        "01 - Acentuação",
        "02 - Concordância",
        "04 - Crase",
        "05 - Subassuntos",
        "03 - Antiga sem ordem",
      ]);
    });
  });

  describe("Assunto sem subassunto: aulas direto no assunto, por ordem", () => {
    const portugues = arvore.find((d) => d.nome === "Português")!;
    const acentuacao = portugues.assuntos.find((a) => a.nome === "01 - Acentuação")!;

    it("lista aulas sem subassunto na ordem correta", () => {
      expect(acentuacao.semSubassunto.map((a) => a.id)).toEqual(["a1", "a2"]);
    });

    it("não cria subassuntos quando não há", () => {
      expect(acentuacao.subassuntos.length).toBe(0);
    });
  });

  describe("Subassunto vazio em branco vira null", () => {
    const portugues = arvore.find((d) => d.nome === "Português")!;
    const crase = portugues.assuntos.find((a) => a.nome === "04 - Crase")!;

    it("subassunto com apenas espaços é tratado como null", () => {
      expect(crase.semSubassunto.map((a) => a.id)).toEqual(["c1"]);
    });
  });

  describe("Assunto com subassuntos", () => {
    const portugues = arvore.find((d) => d.nome === "Português")!;
    const subassuntos = portugues.assuntos.find((a) => a.nome === "05 - Subassuntos")!;

    it("aula sem subassunto vem antes dos subgrupos", () => {
      expect(subassuntos.semSubassunto.map((a) => a.id)).toEqual(["d1"]);
    });

    it("subassuntos ordenados pelo menor ordem do grupo", () => {
      expect(subassuntos.subassuntos.map((s) => s.nome)).toEqual(["Verbos", "Nomes"]);
    });

    it("aulas do subassunto Verbos na ordem correta", () => {
      expect(subassuntos.subassuntos[0].aulas.map((a) => a.id)).toEqual(["d2", "d3"]);
    });

    it("aulas do subassunto Nomes na ordem correta", () => {
      expect(subassuntos.subassuntos[1].aulas.map((a) => a.id)).toEqual(["d4"]);
    });
  });

  describe("Lista plana = ordem exata da árvore (Próxima/Anterior)", () => {
    it("mantém ordem plana igual à árvore", () => {
      expect(plano.map((a) => a.id)).toEqual([
        "e1",
        "a1",
        "a2",
        "a3",
        "c1",
        "d1",
        "d2",
        "d3",
        "d4",
        "b1",
      ]);
    });
  });

  describe("Não depende da ordem do banco", () => {
    it("mesma ordem com entrada invertida", () => {
      const invertido = construirArvore([...formatadas].reverse());
      expect(achatarArvore(invertido).map((a) => a.id)).toEqual(plano.map((a) => a.id));
    });
  });

  describe("primeiraAulaId", () => {
    it("retorna o ID da primeira aula da árvore", () => {
      expect(primeiraAulaId(arvore)).toBe("e1");
    });

    it("retorna null para árvore vazia", () => {
      expect(primeiraAulaId([])).toBeNull();
    });
  });
});