// src/routes/sessoes.tsx
// Etapa 7 + ajuste de eixos: gráficos mostram horas em vez de minutos.
// Correção mobile: grid com coluna definida (grid-cols-1 / minmax(0,1fr)), min-w-0 e paddings responsivos.

import { useState, useEffect, useRef, useMemo } from "react";
import { Play, Pause, Square, Plus, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { useActiveSession } from "@/contexts/ActiveSessionContext";
import { usePomodoro } from "@/contexts/PomodoroContext";
import { PomodoroTimer, PomodoroControls } from "@/components/PomodoroCard";
import { useErrors } from "@/contexts/ErrorContext";
import { useStudy } from "@/contexts/StudyContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { getDb } from "@/lib/db";
import type { StudyType, StudyRecord } from "@/contexts/StudyContext";
import { DailyChallenge } from "@/components/DailyChallenge";
import { PomodoroStats } from "@/components/PomodoroStats";

// MUDANÇA: adicionado min-w-0 (select/input não podem impor largura própria no mobile)
const field = "w-full min-w-0 rounded-xl border border-input bg-muted px-3 py-2 text-sm";

type LinkType = "Sem vínculo" | "Flashcards" | "Lista de questões" | "Simulado" | "PDF";

const LINK_TYPES: LinkType[] = [
  "Sem vínculo",
  "Flashcards",
  "Lista de questões",
  "Simulado",
  "PDF",
];

interface LinkItem {
  id: string;
  name: string;
}

interface TopicItem {
  id: string;
  name: string;
  order: number;
}

const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMinutes(min: number): string {
  if (min <= 0) return "0min";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

// Gera marcações "redondas" no eixo (1h, 2h, 3h...).
function niceHourTicks(maxMinutes: number): { ticks: number[]; domainMax: number } {
  const max = Math.max(60, maxMinutes);
  const candidates = [60, 120, 180, 240]; // 1h, 2h, 3h, 4h
  let step = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (max / c <= 5) { step = c; break; }
  }
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return { ticks, domainMax: ticks[ticks.length - 1] };
}

// Formata a marcação do eixo em horas/minutos.
function formatHoursTick(min: number): string {
  if (min === 0) return "0";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function parseLink(link: string): { type: LinkType; itemName: string } {
  if (!link || link === "Sem vínculo") {
    return { type: "Sem vínculo", itemName: "" };
  }
  const known: LinkType[] = ["Flashcards", "Lista de questões", "Simulado", "PDF"];
  for (const t of known) {
    if (link === t) return { type: t, itemName: "" };
    if (link.startsWith(`${t} · `)) {
      return { type: t, itemName: link.slice(t.length + 3) };
    }
  }
  return { type: "Sem vínculo", itemName: "" };
}

async function loadLinkItems(type: LinkType, userId: string): Promise<LinkItem[]> {
  if (type === "Sem vínculo") return [];
  const db = await getDb();

  if (type === "Flashcards") {
    const docs = await db.decks
      .find({ selector: { user_id: userId, isDeleted: { $ne: true } } })
      .exec();
    return docs
      .map((d: any) => {
        const j = d.toJSON();
        return { id: j.id as string, name: j.name as string };
      })
      .filter((x) => Boolean(x.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (type === "Lista de questões") {
    const docs = await db.listas
      .find({ selector: { user_id: userId, isdeleted: { $ne: true } } })
      .exec();
    return docs
      .map((d: any) => {
        const j = d.toJSON();
        return { id: j.id as string, name: j.titulo as string };
      })
      .filter((x) => Boolean(x.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (type === "Simulado") {
    const docs = await db.simulados
      .find({ selector: { isdeleted: { $ne: true } } })
      .exec();
    return docs
      .map((d: any) => {
        const j = d.toJSON();
        return { id: j.id as string, name: j.titulo as string };
      })
      .filter((x) => Boolean(x.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (type === "PDF") {
    const docs = await db.files
      .find({ selector: { user_id: userId } })
      .exec();
    return docs
      .map((d: any) => d.toJSON())
      .filter((f: any) => {
        if (f.tipo === "application/pdf") return true;
        const n = (f.nome || "").toLowerCase();
        return n.endsWith(".pdf");
      })
      .map((f: any) => ({ id: f.id as string, name: f.nome as string }))
      .filter((x) => Boolean(x.name))
      .sort((a: LinkItem, b: LinkItem) => a.name.localeCompare(b.name));
  }

  return [];
}

async function loadTopicsForDiscipline(
  disciplineId: string,
  userId: string
): Promise<TopicItem[]> {
  const db = await getDb();
  const docs = await db.topics
    .find({
      selector: {
        user_id: userId,
        discipline_id: disciplineId,
        isDeleted: { $ne: true },
      },
    })
    .exec();
  return docs
    .map((d: any) => {
      const j = d.toJSON();
      return {
        id: j.id as string,
        name: j.name as string,
        order: (j.order ?? 0) as number,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 font-display text-lg font-bold">{children}</h2>;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl rf-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const label = p.fullLabel || p.name || p.label;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold">{label}</div>
      <div className="text-foreground/60">{formatMinutes(p.minutes)}</div>
    </div>
  );
}

export default function SessoesPage() {
  // ===== Contextos =====
  const session = useActiveSession();
  const { disciplines, disciplinesLoading, userId } = useErrors();
  const { records, addRecord, deleteRecord } = useStudy();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const pomo = usePomodoro();

  // ===== Qual modo está na tela: Cronômetro livre ou Pomodoro =====
  const [view, setView] = useState<"livre" | "pomodoro">(() => {
    if (session.status !== "idle") return "livre";
    if (pomo.status !== "idle") return "pomodoro";
    try {
      return localStorage.getItem("revisaflash_sessoes_view") === "pomodoro" ? "pomodoro" : "livre";
    } catch {
      return "livre";
    }
  });

  const changeView = (v: "livre" | "pomodoro") => {
    setView(v);
    try {
      localStorage.setItem("revisaflash_sessoes_view", v);
    } catch { /* ignore */ }
  };

  // Se um dos dois estiver rodando, mostra o que está ativo.
  useEffect(() => {
    if (session.status !== "idle") setView("livre");
    else if (pomo.status !== "idle") setView("pomodoro");
  }, [session.status, pomo.status]);

  // ===== Estado da sessão cronometrada =====
  const [finalType, setFinalType] = useState<StudyType>("teorico");
  const [finalObs, setFinalObs] = useState("");
  const [modalFinalizar, setModalFinalizar] = useState(false);
  const [saving, setSaving] = useState(false);

  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [customTopicMode, setCustomTopicMode] = useState(false);

  const [linkItems, setLinkItems] = useState<LinkItem[]>([]);
  const [linkItemsLoading, setLinkItemsLoading] = useState(false);

  const prevStatusRef = useRef(session.status);

  const isIdle = session.status === "idle";
  const isRunning = session.status === "running";
  const isPaused = session.status === "paused";

  // Pomodoro: trava os seletores enquanto um foco está em andamento ou pausado.
  const pomoFocusLocked = pomo.status !== "idle" && pomo.mode === "focus";
  const selectorsLocked = !isIdle || pomoFocusLocked;
  // A chave "Cronômetro livre | Pomodoro" trava se qualquer um dos dois estiver ativo.
  const viewToggleLocked = !isIdle || pomo.status !== "idle";

  const { type: linkType, itemName: linkItemName } = parseLink(session.link);

  const isCustomTopic =
    customTopicMode ||
    (session.topic !== "" && !topics.some((t) => t.name === session.topic));
  const topicSelectValue = isCustomTopic ? "__custom__" : session.topic || "";

  // ===== Estado do calendário =====
  const today = new Date();
  const todayStr = localDateStr(today);
  const [viewMonth, setViewMonth] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ===== Estado do modal "Sessão manual" =====
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState<string>(() => localDateStr(new Date()));
  const [manualDiscipline, setManualDiscipline] = useState("");
  const [manualTopic, setManualTopic] = useState("");
  const [manualTopicCustom, setManualTopicCustom] = useState(false);
  const [manualHours, setManualHours] = useState("1");
  const [manualMinutes, setManualMinutes] = useState("0");
  const [manualType, setManualType] = useState<StudyType>("teorico");
  const [manualObs, setManualObs] = useState("");
  const [manualTopics, setManualTopics] = useState<TopicItem[]>([]);
  const [manualTopicsLoading, setManualTopicsLoading] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);

  const manualTopicIsCustom =
    manualTopicCustom ||
    (manualTopic !== "" && !manualTopics.some((t) => t.name === manualTopic));
  const manualTopicSelectValue = manualTopicIsCustom ? "__custom__" : manualTopic || "";

  // ===== Efeitos: tópicos do cronômetro =====
  useEffect(() => {
    if (!session.discipline || !userId) {
      setTopics([]);
      return;
    }
    const disc = disciplines.find((d) => d.name === session.discipline);
    if (!disc) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    setTopicsLoading(true);
    loadTopicsForDiscipline(disc.id, userId)
      .then((list) => { if (!cancelled) setTopics(list); })
      .catch(() => { if (!cancelled) setTopics([]); })
      .finally(() => { if (!cancelled) setTopicsLoading(false); });
    return () => { cancelled = true; };
  }, [session.discipline, disciplines, userId]);

  // ===== Efeitos: itens do vínculo =====
  useEffect(() => {
    if (linkType === "Sem vínculo" || !userId) {
      setLinkItems([]);
      return;
    }
    let cancelled = false;
    setLinkItemsLoading(true);
    loadLinkItems(linkType, userId)
      .then((items) => { if (!cancelled) setLinkItems(items); })
      .catch(() => { if (!cancelled) setLinkItems([]); })
      .finally(() => { if (!cancelled) setLinkItemsLoading(false); });
    return () => { cancelled = true; };
  }, [linkType, userId]);

  // ===== Efeitos: tópicos do modal manual =====
  useEffect(() => {
    if (!manualOpen) return;
    if (!manualDiscipline || !userId) {
      setManualTopics([]);
      return;
    }
    const disc = disciplines.find((d) => d.name === manualDiscipline);
    if (!disc) {
      setManualTopics([]);
      return;
    }
    let cancelled = false;
    setManualTopicsLoading(true);
    loadTopicsForDiscipline(disc.id, userId)
      .then((list) => { if (!cancelled) setManualTopics(list); })
      .catch(() => { if (!cancelled) setManualTopics([]); })
      .finally(() => { if (!cancelled) setManualTopicsLoading(false); });
    return () => { cancelled = true; };
  }, [manualOpen, manualDiscipline, disciplines, userId]);

  // ===== Reset custom topic quando a sessão termina =====
  useEffect(() => {
    if (prevStatusRef.current !== "idle" && session.status === "idle") {
      setCustomTopicMode(false);
    }
    prevStatusRef.current = session.status;
  }, [session.status]);

  // ===== Handlers do cronômetro =====
  const handleDisciplineChange = (name: string) => {
    if (name === session.discipline) return;
    session.setDiscipline(name);
    session.setTopic("");
    setCustomTopicMode(false);
  };

  const handleTopicSelectChange = (v: string) => {
    if (v === "__custom__") setCustomTopicMode(true);
    else { setCustomTopicMode(false); session.setTopic(v); }
  };

  const handleLinkTypeChange = (newType: LinkType) => {
    if (newType === "Sem vínculo") session.setLink("");
    else session.setLink(newType);
  };

  const handleLinkItemChange = (itemName: string) => {
    if (linkType === "Sem vínculo") return;
    if (itemName) session.setLink(`${linkType} · ${itemName}`);
    else session.setLink(linkType);
  };

  const handleStart = () => {
    if (!session.discipline.trim()) {
      toast.error("Escolha uma disciplina antes de iniciar.");
      return;
    }
    session.start();
  };

  const handleCancel = async () => {
    const ok = await confirmDialog({
      title: "Cancelar sessão?",
      description: "O tempo será descartado e nada será salvo.",
      confirmText: "Sim, cancelar",
      cancelText: "Voltar",
      destructive: true,
    });
    if (ok) {
      session.cancel();
      toast.success("Sessão cancelada.");
    }
  };

  const handleOpenFinalize = () => {
    setFinalType("teorico");
    setFinalObs("");
    setModalFinalizar(true);
  };

  const handleConfirmFinalize = async () => {
    setSaving(true);
    try {
      await session.finalize({ type: finalType, observations: finalObs.trim() || undefined });
      toast.success("Sessão salva com sucesso!");
      setModalFinalizar(false);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar a sessão.", {
        description: "Tente novamente. Se estiver offline, será sincronizado depois.",
      });
    } finally {
      setSaving(false);
    }
  };

  // ===== Handlers do registro manual =====
  const resetManualForm = () => {
    setManualDate(localDateStr(new Date()));
    setManualDiscipline("");
    setManualTopic("");
    setManualTopicCustom(false);
    setManualHours("1");
    setManualMinutes("0");
    setManualType("teorico");
    setManualObs("");
    setManualTopics([]);
  };

  const handleSaveManual = async () => {
    if (!manualDiscipline) {
      toast.error("Escolha uma disciplina.");
      return;
    }
    const h = Math.max(0, parseInt(manualHours || "0", 10) || 0);
    const m = Math.max(0, Math.min(59, parseInt(manualMinutes || "0", 10) || 0));
    const total = h * 60 + m;
    if (total <= 0) {
      toast.error("Informe uma duração maior que zero.");
      return;
    }
    setManualSaving(true);
    try {
      await addRecord({
        date: manualDate,
        type: manualType,
        discipline: manualDiscipline,
        topic: manualTopic.trim(),
        duration: total,
        observations: manualObs.trim() || undefined,
      });
      toast.success("Sessão registrada com sucesso!");
      setManualOpen(false);
      resetManualForm();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar o registro.");
    } finally {
      setManualSaving(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir esta sessão?",
      description: "O registro será removido do histórico e das estatísticas. Não pode ser desfeito.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteRecord(id);
      toast.success("Sessão excluída.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível excluir.");
    }
  };

  // ===== Cálculos de estatísticas =====
  const stats = useMemo(() => {
    const todayMin = records
      .filter((r) => r.date === todayStr)
      .reduce((s, r) => s + r.duration, 0);

    const last7: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7.push(localDateStr(d));
    }
    const weekMin = records
      .filter((r) => last7.includes(r.date))
      .reduce((s, r) => s + r.duration, 0);

    const monthStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}`;
    const monthRecs = records.filter((r) => r.date.startsWith(monthStr));
    const monthTotal = monthRecs.reduce((s, r) => s + r.duration, 0);
    const monthCount = monthRecs.length;
    const monthAvg = monthCount > 0 ? Math.round(monthTotal / monthCount) : 0;

    return {
      todayMin,
      weekMin,
      monthCount,
      monthAvg,
      last7,
    };
  }, [records, todayStr, viewMonth]);

  // ===== Dados do gráfico "Tempo por dia" =====
  const weekData = useMemo(() => {
    return stats.last7.map((dateStr) => {
      const d = new Date(dateStr + "T12:00:00");
      const label = WEEKDAY_SHORT[d.getDay()];
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const minutes = records
        .filter((r) => r.date === dateStr)
        .reduce((s, r) => s + r.duration, 0);
      return {
        date: dateStr,
        label,
        fullLabel: `${dd}/${mm}`,
        minutes,
      };
    });
  }, [records, stats.last7]);

  const weekAxis = useMemo(() => {
    const max = weekData.reduce((m, d) => Math.max(m, d.minutes), 0);
    return niceHourTicks(max);
  }, [weekData]);

  // ===== Dados do gráfico "Por disciplina" =====
  const disciplineData = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach((r) => {
      const key = (r.discipline || "Sem disciplina").trim() || "Sem disciplina";
      map[key] = (map[key] || 0) + r.duration;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map)
      .map(([name, minutes]) => ({
        name,
        minutes,
        percent: total > 0 ? Math.round((minutes / total) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6);
  }, [records]);

  const disciplineAxis = useMemo(() => {
    const max = disciplineData.reduce((m, d) => Math.max(m, d.minutes), 0);
    return niceHourTicks(max);
  }, [disciplineData]);

  // ===== Dados do calendário =====
  const calendar = useMemo(() => {
    const firstDay = new Date(viewMonth.year, viewMonth.month, 1);
    const firstWeekday = firstDay.getDay();
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
    const days: { day: number; dateStr: string; hasRecords: boolean; isToday: boolean }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        day,
        dateStr,
        hasRecords: records.some((r) => r.date === dateStr),
        isToday: dateStr === todayStr,
      });
    }
    return { firstWeekday, days };
  }, [viewMonth, records, todayStr]);

  const goPrevMonth = () => {
    setViewMonth((prev) => {
      const m = prev.month === 0 ? 11 : prev.month - 1;
      const y = prev.month === 0 ? prev.year - 1 : prev.year;
      return { year: y, month: m };
    });
    setSelectedDay(null);
  };
  const goNextMonth = () => {
    setViewMonth((prev) => {
      const m = prev.month === 11 ? 0 : prev.month + 1;
      const y = prev.month === 11 ? prev.year + 1 : prev.year;
      return { year: y, month: m };
    });
    setSelectedDay(null);
  };

  // ===== Sessões recentes (filtradas por dia se houver seleção) =====
  const recentRecords = useMemo(() => {
    const sorted = [...records].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    if (selectedDay) {
      return sorted.filter((r) => r.date === selectedDay).slice(0, 20);
    }
    return sorted.slice(0, 10);
  }, [records, selectedDay]);

  // ===== Render =====
  return (
    <AppShell title="Sessões">
      <div className="mb-5 flex justify-end">
        <button
          onClick={() => { resetManualForm(); setManualOpen(true); }}
          className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm"
        >
          <Plus className="h-4 w-4" /> Sessão manual
        </button>
      </div>

      {/* MUDANÇA: grid-cols-1 no mobile e minmax(0,1fr) no desktop (a coluna nunca passa da tela) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* ===== CRONÔMETRO / POMODORO ===== */}
          {/* MUDANÇA: p-4 no mobile, p-6 a partir de sm */}
          <section className="card-lip min-w-0 p-4 sm:p-6 [--lip:var(--accent)]">
            {/* Chave: Cronômetro livre | Pomodoro */}
            <div className="mx-auto mb-5 flex w-full max-w-sm gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => changeView("livre")}
                disabled={viewToggleLocked && view !== "livre"}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  view === "livre"
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cronômetro livre
              </button>
              <button
                type="button"
                onClick={() => changeView("pomodoro")}
                disabled={viewToggleLocked && view !== "pomodoro"}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  view === "pomodoro"
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pomodoro
              </button>
            </div>

            {view === "livre" ? (
              <>
                <p className="text-center text-sm text-muted-foreground">
                  {isIdle && "Pronto para começar"}
                  {isRunning && "Estudando agora"}
                  {isPaused && "Pausado"}
                </p>
                {/* MUDANÇA: text-5xl no mobile, text-6xl a partir de sm */}
                <p className="my-2 text-center font-display text-5xl font-bold tabular-nums sm:text-6xl">
                  {formatHMS(session.elapsedSeconds)}
                </p>
              </>
            ) : (
              <PomodoroTimer />
            )}

            {/* MUDANÇA: grid-cols-1 explícito no mobile */}
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                className={field}
                value={session.discipline}
                onChange={(e) => handleDisciplineChange(e.target.value)}
                disabled={selectorsLocked}
              >
                <option value="">
                  {disciplinesLoading ? "Carregando..." : "Selecione a disciplina"}
                </option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>

              <div className="min-w-0 space-y-2">
                <select
                  className={field}
                  value={topicSelectValue}
                  onChange={(e) => handleTopicSelectChange(e.target.value)}
                  disabled={selectorsLocked || topicsLoading}
                >
                  <option value="">
                    {topicsLoading
                      ? "Carregando..."
                      : !session.discipline
                      ? "Escolha uma disciplina"
                      : "Sem tópico específico"}
                  </option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                  {topics.length > 0 && (
                    <option value="__custom__">— Digitar outro —</option>
                  )}
                </select>
                {isCustomTopic && (
                  <input
                    type="text"
                    className={field}
                    placeholder="Digite o tópico"
                    value={session.topic}
                    onChange={(e) => session.setTopic(e.target.value)}
                    disabled={selectorsLocked}
                  />
                )}
              </div>

              <div className="min-w-0 space-y-2">
                <select
                  className={field}
                  value={linkType}
                  onChange={(e) => handleLinkTypeChange(e.target.value as LinkType)}
                  disabled={selectorsLocked}
                >
                  {LINK_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {linkType !== "Sem vínculo" && (
                  <select
                    className={field}
                    value={linkItemName}
                    onChange={(e) => handleLinkItemChange(e.target.value)}
                    disabled={selectorsLocked || linkItemsLoading}
                  >
                    <option value="">
                      {linkItemsLoading
                        ? "Carregando..."
                        : linkItems.length === 0
                        ? "Nenhum item encontrado"
                        : "Selecione (opcional)"}
                    </option>
                    {linkItemName &&
                      !linkItems.some((i) => i.name === linkItemName) && (
                        <option value={linkItemName}>{linkItemName} (não encontrado)</option>
                      )}
                    {linkItems.map((item) => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {view === "livre" ? (
            <div className="flex flex-wrap justify-center gap-3">
              {isIdle && (
                <button onClick={handleStart} className="btn-sun flex items-center gap-1.5 px-5 py-2.5">
                  <Play className="h-4 w-4" /> Iniciar
                </button>
              )}
              {isRunning && (
                <button onClick={session.pause} className="btn-sun flex items-center gap-1.5 px-5 py-2.5">
                  <Pause className="h-4 w-4" /> Pausar
                </button>
              )}
              {isPaused && (
                <button onClick={session.resume} className="btn-sun flex items-center gap-1.5 px-5 py-2.5">
                  <Play className="h-4 w-4" /> Continuar
                </button>
              )}
              {!isIdle && (
                <>
                  <button onClick={handleOpenFinalize} className="btn-sun flex items-center gap-1.5 px-5 py-2.5">
                    <Square className="h-4 w-4" /> Finalizar
                  </button>
                  <button onClick={handleCancel} className="btn-ghost flex items-center gap-1.5 px-5 py-2.5">
                    <X className="h-4 w-4" /> Cancelar
                  </button>
                </>
              )}
            </div>
            ) : (
              <PomodoroControls />
            )}
          </section>

          {/* ===== POMODORO HOJE ===== */}
          <PomodoroStats />

          {/* ===== ESTATÍSTICAS REAIS ===== */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Hoje" value={formatMinutes(stats.todayMin)} />
            <StatCard label="Últimos 7 dias" value={formatMinutes(stats.weekMin)} />
            <StatCard label="Sessões no mês" value={String(stats.monthCount)} />
            <StatCard label="Média (mês)" value={formatMinutes(stats.monthAvg)} />
          </div>

          {/* ===== GRÁFICO: TEMPO POR DIA ===== */}
          <section className="min-w-0 rounded-3xl rf-card p-4 sm:p-5">
            <SectionTitle>Tempo por dia (últimos 7 dias)</SectionTitle>
            {weekData.some((d) => d.minutes > 0) ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      ticks={weekAxis.ticks}
                      domain={[0, weekAxis.domainMax]}
                      tickFormatter={formatHoursTick}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="minutes" radius={[8, 8, 0, 0]}>
                      {weekData.map((_, idx) => (
                        <Cell key={idx} fill="var(--primary)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sem sessões nos últimos 7 dias.
              </p>
            )}
          </section>

          {/* ===== GRÁFICO: POR DISCIPLINA ===== */}
          <section className="min-w-0 rounded-3xl rf-card p-4 sm:p-5">
            <SectionTitle>Por disciplina</SectionTitle>
            {disciplineData.length > 0 ? (
              <div style={{ height: Math.max(160, disciplineData.length * 44) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={disciplineData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  >
                    <XAxis
                      type="number"
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      ticks={disciplineAxis.ticks}
                      domain={[0, disciplineAxis.domainMax]}
                      tickFormatter={formatHoursTick}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="minutes" radius={[0, 8, 8, 0]}>
                      {disciplineData.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={idx % 2 === 1 ? "var(--accent)" : "var(--primary)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma sessão registrada ainda.
              </p>
            )}
          </section>
        </div>

        {/* ===== COLUNA DIREITA: CALENDÁRIO + RECENTES ===== */}
        {/* MUDANÇA: min-w-0 na coluna direita */}
        <div className="min-w-0 space-y-6">
          <DailyChallenge />
          <section className="min-w-0 rounded-3xl rf-card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={goPrevMonth}
                className="grid h-7 w-7 place-items-center rounded-md text-foreground/60 hover:bg-muted"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <SectionTitle>
                {MONTH_NAMES[viewMonth.month]} {viewMonth.year}
              </SectionTitle>
              <button
                onClick={goNextMonth}
                className="grid h-7 w-7 place-items-center rounded-md text-foreground/60 hover:bg-muted"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAY_SHORT.map((d, i) => (
                <span key={i} className="text-muted-foreground">{d}</span>
              ))}
              {Array.from({ length: calendar.firstWeekday }).map((_, i) => (
                <span key={"e" + i} />
              ))}
              {calendar.days.map((d) => {
                const isSelected = selectedDay === d.dateStr;
                const cls = [
                  "grid aspect-square place-items-center rounded-lg cursor-pointer transition-colors",
                  d.hasRecords ? "bg-primary font-bold text-primary-foreground" : "bg-muted hover:bg-muted/80",
                  isSelected ? "ring-2 ring-accent" : "",
                  d.isToday && !d.hasRecords ? "ring-1 ring-primary/40" : "",
                ].join(" ");
                return (
                  <button
                    key={d.day}
                    onClick={() => setSelectedDay(isSelected ? null : d.dateStr)}
                    className={cls}
                    aria-label={`Dia ${d.day}`}
                  >
                    {d.day}
                  </button>
                );
              })}
            </div>

            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="mt-3 text-xs text-foreground/60 hover:text-foreground underline"
              >
                Limpar filtro do dia
              </button>
            )}
          </section>

          <section className="min-w-0 rounded-3xl rf-card p-4 sm:p-5">
            <SectionTitle>
              {selectedDay
                ? `Sessões em ${selectedDay.split("-").reverse().join("/")}`
                : "Sessões recentes"}
            </SectionTitle>
            {recentRecords.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {selectedDay
                  ? "Nenhuma sessão neste dia."
                  : "Nenhuma sessão registrada ainda."}
              </p>
            ) : (
              <ul className="space-y-2">
                {recentRecords.map((r: StudyRecord) => {
                  const [, m, d] = r.date.split("-");
                  const dateLabel = `${d}/${m}`;
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-muted p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{r.discipline || "Sem disciplina"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {dateLabel}
                          {r.topic ? ` · ${r.topic}` : ""}
                          {r.source && r.source !== "Sem vínculo" ? ` · ${r.source}` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground whitespace-nowrap">
                        {formatMinutes(r.duration)}
                      </span>
                      <button
                        onClick={() => handleDeleteRecord(r.id)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
                        aria-label="Excluir sessão"
                        title="Excluir sessão"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ===== MODAL: Sessão manual ===== */}
      {manualOpen && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-background/80 p-4 overflow-y-auto"
          onClick={() => !manualSaving && setManualOpen(false)}
        >
          <div
            className="w-full max-w-md my-8 space-y-3 rounded-3xl rf-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Registrar sessão manual</h2>
              <button onClick={() => !manualSaving && setManualOpen(false)} disabled={manualSaving}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-foreground/70">Data</p>
              <input
                type="date"
                className={field}
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                disabled={manualSaving}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-foreground/70">Disciplina *</p>
              <select
                className={field}
                value={manualDiscipline}
                onChange={(e) => {
                  setManualDiscipline(e.target.value);
                  setManualTopic("");
                  setManualTopicCustom(false);
                }}
                disabled={manualSaving || disciplinesLoading}
              >
                <option value="">
                  {disciplinesLoading ? "Carregando..." : "Selecione a disciplina"}
                </option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <p className="mb-1 text-xs font-medium text-foreground/70">Tópico (opcional)</p>
              <select
                className={field}
                value={manualTopicSelectValue}
                onChange={(e) => {
                  if (e.target.value === "__custom__") setManualTopicCustom(true);
                  else { setManualTopicCustom(false); setManualTopic(e.target.value); }
                }}
                disabled={manualSaving || manualTopicsLoading}
              >
                <option value="">
                  {manualTopicsLoading
                    ? "Carregando..."
                    : !manualDiscipline
                    ? "Escolha uma disciplina"
                    : "Sem tópico específico"}
                </option>
                {manualTopics.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
                {manualTopics.length > 0 && (
                  <option value="__custom__">— Digitar outro —</option>
                )}
              </select>
              {manualTopicIsCustom && (
                <input
                  type="text"
                  className={field}
                  placeholder="Digite o tópico"
                  value={manualTopic}
                  onChange={(e) => setManualTopic(e.target.value)}
                  disabled={manualSaving}
                />
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-foreground/70">Duração *</p>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <input
                    type="number"
                    min="0"
                    className={field}
                    placeholder="Horas"
                    value={manualHours}
                    onChange={(e) => setManualHours(e.target.value)}
                    disabled={manualSaving}
                  />
                  <p className="mt-1 text-[10px] text-foreground/50">Horas</p>
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    className={field}
                    placeholder="Minutos"
                    value={manualMinutes}
                    onChange={(e) => setManualMinutes(e.target.value)}
                    disabled={manualSaving}
                  />
                  <p className="mt-1 text-[10px] text-foreground/50">Minutos</p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-foreground/70">Tipo de estudo</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setManualType("teorico")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                    manualType === "teorico" ? "border-primary bg-primary/10 font-semibold" : "border-input"
                  }`}
                  disabled={manualSaving}
                >
                  Teórico
                </button>
                <button
                  type="button"
                  onClick={() => setManualType("pratico")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                    manualType === "pratico" ? "border-primary bg-primary/10 font-semibold" : "border-input"
                  }`}
                  disabled={manualSaving}
                >
                  Prático
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-foreground/70">Observações (opcional)</p>
              <textarea
                className={field}
                rows={3}
                placeholder="Ex.: revisei anotações, refiz questões..."
                value={manualObs}
                onChange={(e) => setManualObs(e.target.value)}
                disabled={manualSaving}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => !manualSaving && setManualOpen(false)}
                disabled={manualSaving}
                className="btn-ghost flex-1 py-2.5"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveManual}
                disabled={manualSaving}
                className="btn-sun flex-1 py-2.5"
              >
                {manualSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: Resumo / Finalizar (sessão cronometrada) ===== */}
      {modalFinalizar && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-background/80 p-4"
          onClick={() => !saving && setModalFinalizar(false)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-3xl rf-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Resumo da sessão</h2>
              <button onClick={() => !saving && setModalFinalizar(false)} disabled={saving}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1 rounded-2xl bg-muted p-3 text-sm">
              <p><b>Duração:</b> {formatHMS(session.elapsedSeconds)}</p>
              <p><b>Disciplina:</b> {session.discipline || "—"}</p>
              {session.topic.trim() && <p><b>Conteúdo:</b> {session.topic}</p>}
              {session.link && session.link !== "Sem vínculo" && (
                <p><b>Vínculo:</b> {session.link}</p>
              )}
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">Tipo de estudo</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFinalType("teorico")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                    finalType === "teorico" ? "border-primary bg-primary/10 font-semibold" : "border-input"
                  }`}
                >
                  Teórico
                </button>
                <button
                  type="button"
                  onClick={() => setFinalType("pratico")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                    finalType === "pratico" ? "border-primary bg-primary/10 font-semibold" : "border-input"
                  }`}
                >
                  Prático
                </button>
              </div>
            </div>

            <textarea
              className={field}
              rows={3}
              placeholder="Observações (opcional)"
              value={finalObs}
              onChange={(e) => setFinalObs(e.target.value)}
            />

            <div className="flex gap-2">
              <button
                onClick={() => !saving && setModalFinalizar(false)}
                disabled={saving}
                className="btn-ghost flex-1 py-2.5"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmFinalize}
                disabled={saving}
                className="btn-sun flex-1 py-2.5"
              >
                {saving ? "Salvando…" : "Salvar registro"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}