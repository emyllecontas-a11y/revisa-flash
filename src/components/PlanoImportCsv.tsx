// src/components/PlanoImportCsv.tsx
// (Mantive o nome do arquivo/componente para não quebrar o import do PlanoGestaoModal.
//  Se quiser, renomeie depois para PlanoImportExcel.)
import { useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, AlertTriangle, Check, X } from "lucide-react";
import { lerPlanoExcel, type ResultadoImportacao } from "@/lib/excelParser";
import { salvarPlanoCustomizado } from "@/services/planoService";
import { useToast } from "@/hooks/useToast";

// O modelo fica em public/Modelo_Plano_Estudos.xlsx
const MODELO_URL = `${import.meta.env.BASE_URL}Modelo_Plano_Estudos.xlsx`;

// Segunda-feira da semana atual, voltando (semanaAtual - 1) semanas. Retorna "YYYY-MM-DD".
function calcularDataInicio(semanaAtual: number): string {
  const hoje = new Date();
  const diaDaSemana = hoje.getDay();
  const diffParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
  const segundaDestaSemana = new Date(hoje);
  segundaDestaSemana.setDate(hoje.getDate() + diffParaSegunda);

  const dataInicio = new Date(segundaDestaSemana);
  dataInicio.setDate(segundaDestaSemana.getDate() - (semanaAtual - 1) * 7);

  const y = dataInicio.getFullYear();
  const m = String(dataInicio.getMonth() + 1).padStart(2, "0");
  const d = String(dataInicio.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-semibold">
      {children}
    </kbd>
  );
}

export function PlanoImportCsv({
  userId,
  onCancel,
  onSuccess,
}: {
  userId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [nomePlano, setNomePlano] = useState("Meu Plano Importado");
  const [semanaAtual, setSemanaAtual] = useState(1);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [arrastando, setArrastando] = useState(false);

  const limparArquivo = () => {
    setArquivo(null);
    setResultado(null);
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Lê o arquivo assim que o usuário escolhe, para mostrar a prévia e os avisos
  const handleArquivo = async (file: File | null) => {
    limparArquivo();
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setErro("Esse arquivo não é .xlsx. Baixe o modelo, preencha e salve como Excel (.xlsx).");
      return;
    }

    setArquivo(file);
    setLendo(true);
    try {
      const r = await lerPlanoExcel(file);
      setResultado(r);
      setSemanaAtual((s) => Math.min(Math.max(1, s), r.semanas.length));
    } catch (err: any) {
      setErro(err?.message || "Não consegui ler esse arquivo.");
    } finally {
      setLendo(false);
    }
  };

  const handleSalvar = async () => {
    if (!resultado) {
      toast.error("Escolha um arquivo .xlsx primeiro.");
      return;
    }

    setSaving(true);
    try {
      await salvarPlanoCustomizado(userId, nomePlano, calcularDataInicio(semanaAtual), resultado.semanas);
      toast.success("Plano importado com sucesso!");
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao importar o plano: " + (err?.message || "tente novamente."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. MODELO + GUIA */}
      <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl space-y-3">
        <h3 className="font-semibold text-sm">1. Baixe o modelo e preencha</h3>
        <p className="text-xs text-muted-foreground">
          Cada linha é uma semana e cada coluna é um dia. Funciona no Excel e no Google Planilhas.
        </p>

        <a
          href={MODELO_URL}
          download="Modelo_Plano_Estudos.xlsx"
          className="btn-ghost bg-background border border-border px-3 py-1.5 text-xs inline-flex items-center gap-2"
        >
          <Download className="h-3.5 w-3.5" /> Baixar modelo Excel (.xlsx)
        </a>

        {/* Mini exemplo visual */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-[11px]">
          {["Segunda", "Terça", "Quarta"].map((d) => (
            <div key={d} className="bg-primary/20 px-2 py-1 text-center font-semibold">
              {d}
            </div>
          ))}
          <div className="bg-background px-2 py-1.5 space-y-0.5">
            <div>Português: Acentuação</div>
            <div>Matemática: Conjuntos</div>
          </div>
          <div className="bg-background px-2 py-1.5">Biologia: Citologia</div>
          <div className="bg-background px-2 py-1.5 italic text-muted-foreground">vazio = dia livre</div>
        </div>

        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>
            • Escreva <b className="text-foreground">Matéria: Tema</b> em cada dia.
          </li>
          <li>
            • Mais de uma matéria no mesmo dia? Pule de linha dentro da célula com <Tecla>Alt</Tecla> +{" "}
            <Tecla>Enter</Tecla> (Mac: <Tecla>Control</Tecla> + <Tecla>Option</Tecla> + <Tecla>Enter</Tecla> ·
            Google Planilhas: <Tecla>Ctrl</Tecla> + <Tecla>Enter</Tecla>).
          </li>
          <li>
            • Quer anotar um detalhe? Use <b className="text-foreground">|</b> depois do tema:{" "}
            <span className="text-foreground">Português: Crase | Aulas 6 a 10</span>
          </li>
          <li>• Não mude os títulos da primeira linha (Semana, Segunda, Terça...).</li>
        </ul>
      </div>

      {/* 2. INFORMAÇÕES */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">2. Informações do plano</h3>
        <div>
          <label className="block text-xs mb-1">Nome do plano</label>
          <input
            value={nomePlano}
            onChange={(e) => setNomePlano(e.target.value)}
            className="w-full p-2 rounded-lg bg-background border border-border text-sm"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Em qual semana você está HOJE?</label>
          <input
            type="number"
            min={1}
            max={resultado?.semanas.length}
            value={semanaAtual}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              setSemanaAtual(resultado ? Math.min(v, resultado.semanas.length) : v);
            }}
            className="w-full p-2 rounded-lg bg-background border border-border text-sm"
          />
        </div>
      </div>

      {/* 3. UPLOAD */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">3. Envie o arquivo preenchido</h3>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            handleArquivo(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-6 text-center transition ${
            arrastando ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
          }`}
        >
          <FileSpreadsheet className="h-8 w-8 text-primary" />
          <span className="text-sm font-medium break-all">
            {arquivo ? arquivo.name : "Toque para escolher o arquivo .xlsx"}
          </span>
          <span className="text-xs text-muted-foreground">ou arraste e solte aqui</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => handleArquivo(e.target.files?.[0] ?? null)}
          />
        </label>

        {arquivo && (
          <button
            type="button"
            onClick={limparArquivo}
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
          >
            <X className="h-3 w-3" /> Remover arquivo
          </button>
        )}

        {lendo && <p className="text-xs text-muted-foreground">Lendo o arquivo...</p>}

        {erro && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {erro}
          </div>
        )}

        {resultado && (
          <div className="space-y-2">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs flex items-center gap-2">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span>
                Li <b>{resultado.semanas.length}</b> {resultado.semanas.length === 1 ? "semana" : "semanas"} e{" "}
                <b>{resultado.totalBlocos}</b> {resultado.totalBlocos === 1 ? "matéria" : "matérias"}. Tudo certo
                para importar.
              </span>
            </div>

            {resultado.avisos.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                <div className="flex items-center gap-2 font-semibold text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Atenção
                </div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {resultado.avisos.map((a, i) => (
                    <li key={i}>• {a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="btn-ghost px-4 py-2">
          Cancelar
        </button>
        <button
          onClick={handleSalvar}
          disabled={saving || lendo || !resultado}
          className="btn-sun px-4 py-2 flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            "Importando..."
          ) : (
            <>
              <Upload className="h-4 w-4" /> Importar plano
            </>
          )}
        </button>
      </div>
    </div>
  );
}