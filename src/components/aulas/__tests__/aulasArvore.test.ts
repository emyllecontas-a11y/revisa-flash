// src/components/aulas/__tests__/aulasArvore.test.ts
//
// Teste da lógica da árvore de aulas (ordenação, subassuntos e lista plana).
// Roda sem navegador e sem banco:
//   npx tsx src/components/aulas/__tests__/aulasArvore.test.ts

import { formatarAula, construirArvore, achatarArvore } from "../aulasArvore";

let falhas = 0;

function check(nome: string, atual: unknown, esperado: unknown) {
  const a = JSON.stringify(atual);
  const b = JSON.stringify(esperado);
  if (a === b) {
    console.log(`  OK   ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}\n       atual:    ${a}\n       esperado: ${b}`);
  }
}

type AulaFake = Parameters<typeof formatarAula>[0];

function aula(id: string, disciplina: string, assunto: string, ordem: number, extra: Partial<AulaFake> = {}): AulaFake {
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
    ...extra,
  };
}

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

const formatadas = dados.map(formatarAula);
const arvore = construirArvore(formatadas);
const plano = achatarArvore(arvore);

console.log("\n== Disciplinas em ordem alfabética ==");
check("disciplinas", arvore.map((d) => d.nome), ["Matemática", "Português"]);

const portugues = arvore.find((d) => d.nome === "Português")!;

console.log("\n== Assuntos: assunto_ordem crescente, null no fim, desempate por nome ==");
check("ordem dos assuntos", portugues.assuntos.map((a) => a.nome), [
  "01 - Acentuação",
  "02 - Concordância",
  "04 - Crase",
  "05 - Subassuntos",
  "03 - Antiga sem ordem",
]);

const acentuacao = portugues.assuntos.find((a) => a.nome === "01 - Acentuação")!;

console.log("\n== Assunto sem subassunto: aulas direto no assunto, por ordem ==");
check("aulas de Acentuação", acentuacao.semSubassunto.map((a) => a.id), ["a1", "a2"]);
check("nada de subassunto aqui", acentuacao.subassuntos.length, 0);

const crase = portugues.assuntos.find((a) => a.nome === "04 - Crase")!;
check("subassunto vazio em branco vira null", crase.semSubassunto.map((a) => a.id), ["c1"]);

const subassuntos = portugues.assuntos.find((a) => a.nome === "05 - Subassuntos")!;
check("aula sem subassunto vem antes dos subgrupos", subassuntos.semSubassunto.map((a) => a.id), ["d1"]);
check("subassuntos ordenados pelo menor ordem do grupo", subassuntos.subassuntos.map((s) => s.nome), [
  "Verbos",
  "Nomes",
]);
check("aulas do subassunto Verbos", subassuntos.subassuntos[0].aulas.map((a) => a.id), ["d2", "d3"]);
check("aulas do subassunto Nomes", subassuntos.subassuntos[1].aulas.map((a) => a.id), ["d4"]);

console.log("\n== Lista plana = ordem exata da árvore (Próxima/Anterior) ==");
check("ordem plana", plano.map((a) => a.id), [
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

console.log("\n== Não depende da ordem do banco ==");
const invertido = construirArvore([...formatadas].reverse());
check("mesma ordem com entrada invertida", achatarArvore(invertido).map((a) => a.id), plano.map((a) => a.id));

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} TESTE(S) FALHARAM`}`);
if (falhas > 0) throw new Error(`${falhas} teste(s) da árvore de aulas falharam`);