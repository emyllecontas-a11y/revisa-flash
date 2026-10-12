// src/components/QuestaoCard.tsx
// Componente visual puro para renderizar uma questão.
// Não tem lógica própria — recebe tudo por props.
// Usado pelas telas de Simulado (resolvendo) e Lista (resolvendo).

import { Bookmark, Check, Scissors, X } from "lucide-react";

export interface AlternativaView {
  letra: string;
  texto: string;
}

export interface QuestaoCardProps {
  /** Número da questão (1, 2, 3...) */
  numero: number;
  /** Total de questões */
  total: number;
  /** Ano da questão (opcional) */
  ano?: string | number | null;
  /** Área/disciplina (opcional) */
  area?: string | null;
  /** Instituição/banca (opcional) */
  instituicao?: string | null;
  /** Enunciado da questão */
  enunciado: string;
  /** URLs das imagens (opcional). Renderizadas abaixo do enunciado. */
  imagens?: string[];
  /** Tipo da questão */
  tipo?: "multipla_escolha" | "certo_errado";
  /** Alternativas. Para certo_errado use: [{letra:"C",texto:"Certo"},{letra:"E",texto:"Errado"}] */
  alternativas: AlternativaView[];
  /** Letra da alternativa selecionada */
  selecionada?: string | null;
  /** Letras eliminadas (riscadas). Só usado quando permitirEliminar=true. */
  eliminadas?: string[];
  /** Letra da alternativa correta (usada quando revelar=true) */
  correta?: string | null;
  /** Comentário geral (usado quando revelar=true) */
  comentario?: string | null;
  /** Se true, mostra as alternativas coloridas (verde/vermelha) */
  revelar?: boolean;
  /** Se true, mostra o botão de tesoura (eliminar) nas alternativas */
  permitirEliminar?: boolean;
  /** Se true, o botão "Marcar" aparece ativo */
  marcada?: boolean;
  /** Callback de seleção de alternativa */
  onSelecionar: (letra: string) => void;
  /** Callback de eliminar/restaurar alternativa */
  onEliminar?: (letra: string) => void;
  /** Callback de marcar/desmarcar a questão */
  onMarcar?: () => void;
}

export function QuestaoCard({
  numero,
  total,
  ano,
  area,
  instituicao,
  enunciado,
  imagens,
  tipo = "multipla_escolha",
  alternativas,
  selecionada = null,
  eliminadas = [],
  correta = null,
  comentario = null,
  revelar = false,
  permitirEliminar = false,
  marcada = false,
  onSelecionar,
  onEliminar,
  onMarcar,
}: QuestaoCardProps) {
  const isCertoErrado = tipo === "certo_errado";

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
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{enunciado}</p>

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
        </p>

        {/* Alternativas — múltipla escolha */}
        {!isCertoErrado && (
          <div className="mt-2 space-y-2.5">
            {alternativas.map((a) => {
              const isSel = selecionada === a.letra;
              const isCorreta = revelar && correta === a.letra;
              const isErrada = revelar && isSel && correta !== a.letra;
              const cut = eliminadas.includes(a.letra);

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
                  <button
                    type="button"
                    disabled={cut}
                    onClick={() => onSelecionar(a.letra)}
                    className="flex flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
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
                    <span
                      className={
                        cut ? "text-muted-foreground line-through opacity-60" : ""
                      }
                    >
                      {a.texto}
                    </span>
                  </button>
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

              const cls = isCorreta
                ? "border-green-500 bg-green-500/15"
                : isErrada
                ? "border-destructive bg-destructive/15"
                : isSel
                ? "border-primary bg-surface-2"
                : "border-transparent bg-muted hover:bg-surface-2";

              return (
                <button
                  key={a.letra}
                  type="button"
                  onClick={() => onSelecionar(a.letra)}
                  className={`rounded-2xl border-2 p-4 text-center transition-colors ${cls}`}
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
                  {isSel && !revelar && (
                    <div className="mt-1 text-[10px] text-foreground/40">Selecionado</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Bloco de correção (aparece quando revelar=true e tem comentário) */}
        {revelar && comentario && (
          <div className="mt-6 rounded-2xl bg-muted p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-primary">
              Comentário
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {comentario}
            </p>
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