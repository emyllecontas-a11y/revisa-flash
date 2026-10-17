// src/components/QuestaoCard.tsx
// Componente visual puro para renderizar uma questão.
// Suporta: sublinhado, negrito, itálico, imagens, certo/errado e grifos interativos.

import { Bookmark, Check, Scissors, X } from "lucide-react";
import { Fragment } from "react";
import { TextoGrifavel } from "@/components/TextoGrifavel";
import type {
  AnotacaoQuestao,
  CampoAlvo,
  CorGrifo,
  RectGrifo,
} from "@/lib/anotacoes-types";

export interface AlternativaView {
  letra: string;
  texto: string;
}

export interface Intervalo {
  inicio: number;
  fim: number;
}

export interface QuestaoCardProps {
  numero: number;
  total: number;
  ano?: string | number | null;
  area?: string | null;
  instituicao?: string | null;
  enunciado: string;
  sublinhadosEnunciado?: Intervalo[] | null;
  negritosEnunciado?: Intervalo[] | null;
  italicosEnunciado?: Intervalo[] | null;
  imagens?: string[];
  tipo?: "multipla_escolha" | "certo_errado";
  alternativas: AlternativaView[];
  selecionada?: string | null;
  eliminadas?: string[];
  correta?: string | null;
  comentario?: string | null;
  sublinhadosComentario?: Intervalo[] | null;
  negritosComentario?: Intervalo[] | null;
  italicosComentario?: Intervalo[] | null;
  revelar?: boolean;
  permitirEliminar?: boolean;
  marcada?: boolean;
  onSelecionar: (letra: string) => void;
  onEliminar?: (letra: string) => void;
  onMarcar?: () => void;

  // ---- Grifos (opcional) ----
  anotacoes?: AnotacaoQuestao[];
  onGrifar?: (campo: CampoAlvo, cor: CorGrifo, texto: string, rects: RectGrifo[]) => void;
  onRemoverGrifo?: (id: string) => void;
  onTrocarCorGrifo?: (id: string, cor: CorGrifo) => void;
  /** Se false, não permite criar novos grifos (mas mostra os existentes) */
  grifarAtivo?: boolean;
}

const campoAlternativa = (letra: string): CampoAlvo => `alternativa_${letra}` as CampoAlvo;

function TextoFormatado({
  texto,
  sublinhados,
  negritos,
  italicos,
}: {
  texto: string;
  sublinhados?: Intervalo[] | null;
  negritos?: Intervalo[] | null;
  italicos?: Intervalo[] | null;
}) {
  const n = texto.length;
  const mask = new Uint8Array(n);
  for (const s of sublinhados ?? []) {
    const a = Math.max(0, s.inicio), b = Math.min(n, s.fim);
    for (let i = a; i < b; i++) mask[i] |= 1;
  }
  for (const s of negritos ?? []) {
    const a = Math.max(0, s.inicio), b = Math.min(n, s.fim);
    for (let i = a; i < b; i++) mask[i] |= 2;
  }
  for (const s of italicos ?? []) {
    const a = Math.max(0, s.inicio), b = Math.min(n, s.fim);
    for (let i = a; i < b; i++) mask[i] |= 4;
  }

  if (mask.every((m) => m === 0)) return <>{texto}</>;

  const partes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < n) {
    const m = mask[i];
    let j = i;
    while (j < n && mask[j] === m) j++;
    const trecho = texto.slice(i, j);

    if (m === 0) {
      partes.push(<Fragment key={key++}>{trecho}</Fragment>);
    } else {
      let node: React.ReactNode = trecho;
      if (m & 1) node = <u>{node}</u>;
      if (m & 2) node = <b>{node}</b>;
      if (m & 4) node = <i>{node}</i>;
      partes.push(<Fragment key={key++}>{node}</Fragment>);
    }
    i = j;
  }
  return <>{partes}</>;
}

export function QuestaoCard({
  numero,
  total,
  ano,
  area,
  instituicao,
  enunciado,
  sublinhadosEnunciado,
  negritosEnunciado,
  italicosEnunciado,
  imagens,
  tipo = "multipla_escolha",
  alternativas,
  selecionada = null,
  eliminadas = [],
  correta = null,
  comentario = null,
  sublinhadosComentario,
  negritosComentario,
  italicosComentario,
  revelar = false,
  permitirEliminar = false,
  marcada = false,
  onSelecionar,
  onEliminar,
  onMarcar,
  anotacoes,
  onGrifar,
  onRemoverGrifo,
  onTrocarCorGrifo,
  grifarAtivo = true,
}: QuestaoCardProps) {
  const isCertoErrado = tipo === "certo_errado";
  const grifoHabilitado = !!onGrifar;
  const podeGrifar = grifoHabilitado && grifarAtivo;

  const grifosDoCampo = (campo: CampoAlvo): AnotacaoQuestao[] =>
    (anotacoes ?? []).filter((a) => a.campo_alvo === campo && !a.isdeleted);

  const handleCliqueAlternativa = (letra: string) => {
    // Se o usuário acabou de selecionar texto (para grifar), não conta como clique.
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && sel.toString().trim().length > 0) return;
    onSelecionar(letra);
  };

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-surface">
      {/* Faixa superior (magenta) com metadados */}
      <div className="grid gap-3 bg-sidebar px-5 py-4 text-sidebar-foreground sm:grid-cols-2 lg:px-7">
        <div className="space-y-0.5 text-sm">
          <p className="font-display text-lg font-bold">
            Questão {numero}{" "}
            <span className="text-sm font-medium opacity-70">de {total}</span>
          </p>
          {ano !== undefined && ano !== null && ano !== "" && (
            <p className="opacity-80">
              Ano: <b>{ano}</b>
            </p>
          )}
        </div>

        <div className="space-y-0.5 text-sm sm:text-right">
          {area && (
            <p className="opacity-80">
              Área: <b>{area}</b>
            </p>
          )}
          {instituicao && (
            <p className="opacity-80">
              Instituição: <b>{instituicao}</b>
            </p>
          )}
          {onMarcar && (
            <button
              type="button"
              onClick={onMarcar}
              className={[
                "mt-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors",
                marcada ? "bg-primary text-primary-foreground" : "bg-background/30",
              ].join(" ")}
            >
              <Bookmark
                className={["h-3.5 w-3.5", marcada ? "fill-current" : ""].join(" ")}
              />
              {marcada ? "Marcada" : "Marcar"}
            </button>
          )}
        </div>
      </div>

      <div className="p-5 lg:p-7">
        {/* Enunciado */}
        {grifoHabilitado ? (
          <TextoGrifavel
            grifos={grifosDoCampo("enunciado")}
            ativo={podeGrifar}
            onGrifar={(cor, texto, rects) => onGrifar!("enunciado", cor, texto, rects)}
            onRemover={onRemoverGrifo}
            onTrocarCor={onTrocarCorGrifo}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              <TextoFormatado
                texto={enunciado}
                sublinhados={sublinhadosEnunciado}
                negritos={negritosEnunciado}
                italicos={italicosEnunciado}
              />
            </p>
          </TextoGrifavel>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            <TextoFormatado
              texto={enunciado}
              sublinhados={sublinhadosEnunciado}
              negritos={negritosEnunciado}
              italicos={italicosEnunciado}
            />
          </p>
        )}

        {/* Imagens da questão */}
        {imagens && imagens.length > 0 && (
          <div className="mt-4 space-y-3">
            {imagens.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Imagem da questão ${numero}`}
                className="max-h-80 rounded-lg border border-border"
              />
            ))}
          </div>
        )}

        {/* Dica de interação */}
        <p className="mt-6 text-xs text-muted-foreground">
          {isCertoErrado
            ? "Escolha Certo ou Errado"
            : permitirEliminar
            ? "Toque na alternativa para responder · use a tesoura para eliminar"
            : "Toque na alternativa para responder"}
          {grifoHabilitado && podeGrifar && (
            <> · selecione um trecho para grifar</>
          )}
        </p>

        {/* Alternativas — múltipla escolha */}
        {!isCertoErrado && (
          <div className="mt-2 space-y-2.5">
            {alternativas.map((a) => {
              const isSel = selecionada === a.letra;
              const isCorreta = revelar && correta === a.letra;
              const isErrada = revelar && isSel && correta !== a.letra;
              const cut = eliminadas.includes(a.letra);
              const campo = campoAlternativa(a.letra);
              const grifosAlt = grifosDoCampo(campo);

              const borderCls = isCorreta
                ? "border-green-500 bg-green-500/15"
                : isErrada
                ? "border-destructive bg-destructive/15"
                : isSel
                ? "border-primary bg-surface-2"
                : "border-transparent bg-muted hover:bg-surface-2";

              return (
                <div
                  key={a.letra}
                  className={`flex items-center gap-2 rounded-2xl border-2 p-2.5 text-sm transition-colors ${borderCls}`}
                >
                  {permitirEliminar && onEliminar && (
                    <button
                      type="button"
                      onClick={() => onEliminar(a.letra)}
                      aria-label={`Eliminar ${a.letra}`}
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                        cut
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Scissors className="h-4 w-4" />
                    </button>
                  )}
                  <div
                    role="button"
                    tabIndex={cut ? -1 : 0}
                    aria-disabled={cut}
                    onClick={() => !cut && handleCliqueAlternativa(a.letra)}
                    onKeyDown={(e) => {
                      if (cut) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCliqueAlternativa(a.letra);
                      }
                    }}
                    className={`flex flex-1 items-center gap-3 text-left ${
                      cut ? "cursor-not-allowed" : "cursor-pointer"
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                        isSel && !revelar
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {isCorreta ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : isErrada ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : (
                        a.letra
                      )}
                    </span>
                    {grifoHabilitado ? (
                      <TextoGrifavel
                        grifos={grifosAlt}
                        ativo={podeGrifar && !cut}
                        onGrifar={(cor, texto, rects) => onGrifar!(campo, cor, texto, rects)}
                        onRemover={onRemoverGrifo}
                        onTrocarCor={onTrocarCorGrifo}
                      >
                        <span
                          className={
                            cut ? "text-muted-foreground line-through opacity-60" : ""
                          }
                        >
                          {a.texto}
                        </span>
                      </TextoGrifavel>
                    ) : (
                      <span
                        className={
                          cut ? "text-muted-foreground line-through opacity-60" : ""
                        }
                      >
                        {a.texto}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Alternativas — certo/errado */}
        {isCertoErrado && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            {alternativas.map((a) => {
              const isSel = selecionada === a.letra;
              const isCorreta = revelar && correta === a.letra;
              const isErrada = revelar && isSel && correta !== a.letra;
              const campo = campoAlternativa(a.letra);
              const grifosAlt = grifosDoCampo(campo);

              const cls = isCorreta
                ? "border-green-500 bg-green-500/15"
                : isErrada
                ? "border-destructive bg-destructive/15"
                : isSel
                ? "border-primary bg-surface-2"
                : "border-transparent bg-muted hover:bg-surface-2";

              return (
                <div
                  key={a.letra}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleCliqueAlternativa(a.letra)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleCliqueAlternativa(a.letra);
                    }
                  }}
                  className={`rounded-2xl border-2 p-4 text-center transition-colors cursor-pointer ${cls}`}
                >
                  {grifoHabilitado ? (
                    <TextoGrifavel
                      grifos={grifosAlt}
                      ativo={podeGrifar}
                      onGrifar={(cor, texto, rects) => onGrifar!(campo, cor, texto, rects)}
                      onRemover={onRemoverGrifo}
                      onTrocarCor={onTrocarCorGrifo}
                    >
                      <div
                        className={`font-display text-sm font-semibold ${
                          isCorreta
                            ? "text-green-500"
                            : isErrada
                            ? "text-destructive"
                            : isSel
                            ? "text-primary"
                            : "text-foreground/70"
                        }`}
                      >
                        {a.texto}
                      </div>
                    </TextoGrifavel>
                  ) : (
                    <div
                      className={`font-display text-sm font-semibold ${
                        isCorreta
                          ? "text-green-500"
                          : isErrada
                          ? "text-destructive"
                          : isSel
                          ? "text-primary"
                          : "text-foreground/70"
                      }`}
                    >
                      {a.texto}
                    </div>
                  )}
                  {isSel && !revelar && (
                    <div className="mt-1 text-[10px] text-foreground/40">Selecionado</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Comentário */}
        {revelar && comentario && (
          <div className="mt-6 rounded-2xl bg-muted p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-primary">
              Comentário
            </p>
            {grifoHabilitado ? (
              <TextoGrifavel
                grifos={grifosDoCampo("comentario")}
                ativo={podeGrifar}
                onGrifar={(cor, texto, rects) => onGrifar!("comentario", cor, texto, rects)}
                onRemover={onRemoverGrifo}
                onTrocarCor={onTrocarCorGrifo}
              >
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  <TextoFormatado
                    texto={comentario}
                    sublinhados={sublinhadosComentario}
                    negritos={negritosComentario}
                    italicos={italicosComentario}
                  />
                </p>
              </TextoGrifavel>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                <TextoFormatado
                  texto={comentario}
                  sublinhados={sublinhadosComentario}
                  negritos={negritosComentario}
                  italicos={italicosComentario}
                />
              </p>
            )}
            {selecionada && correta && (
              <div className="mt-3 flex gap-4 text-xs">
                <span>
                  Sua resposta: <b>{selecionada}</b>
                </span>
                <span>
                  Resposta correta: <b className="text-green-500">{correta}</b>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}