import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { getDb } from "@/lib/db";

interface ContentTreeSelectorProps {
  userId: string;
  selectedTopicIds: string[];
  onChange: (topicIds: string[]) => void;
  allowMultiple?: boolean;
}

export function ContentTreeSelector({
  userId,
  selectedTopicIds,
  onChange,
  allowMultiple = true,
}: ContentTreeSelectorProps) {
  const toast = useToast();
  const [disciplines, setDisciplines] = useState<Array<{ id: string; name: string }>>([]);
  const [topicsByDiscipline, setTopicsByDiscipline] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Carregar dados do RxDB (offline-first)
  const loadData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const db = await getDb();

      // Buscar disciplinas do usuário (não deletadas)
      const disciplinesResult = await db.disciplines.find({
        selector: { user_id: userId, isDeleted: { $ne: true } }
      }).exec();
      const disciplinesData = disciplinesResult.map((doc: any) => doc.toJSON());
      setDisciplines(disciplinesData.map((d: any) => ({ id: d.id, name: d.name })));

      // Buscar todos os tópicos do usuário de uma vez (não deletados)
      const topicsResult = await db.topics.find({
        selector: { user_id: userId, isDeleted: { $ne: true } }
      }).exec();
      const topicsData = topicsResult.map((doc: any) => doc.toJSON());

      // Agrupar tópicos por discipline_id em memória (evita N+1 queries)
      const topicsMap: Record<string, Array<{ id: string; name: string }>> = {};
      topicsData.forEach((topic: any) => {
        const discId = topic.discipline_id;
        if (!topicsMap[discId]) topicsMap[discId] = [];
        topicsMap[discId].push({ id: topic.id, name: topic.name });
      });
      setTopicsByDiscipline(topicsMap);

      // Expandir primeiras disciplinas por padrão
      if (disciplinesData.length > 0) {
        const initialExpanded = new Set(disciplinesData.slice(0, 3).map((d: any) => d.id));
        setExpandedDisciplines(initialExpanded);
      }
    } catch (err) {
      console.error("Erro ao carregar árvore de conteúdo do RxDB:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar disciplinas e tópicos");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
  };

  // Filtrar tópicos baseado na busca
  const filteredTopicsByDiscipline = useMemo(() => {
    if (!searchQuery.trim()) return topicsByDiscipline;

    const query = searchQuery.toLowerCase().trim();
    const filtered: Record<string, Array<{ id: string; name: string }>> = {};

    Object.entries(topicsByDiscipline).forEach(([discId, topics]) => {
      const matching = topics.filter((t) => t.name.toLowerCase().includes(query));
      if (matching.length > 0) {
        filtered[discId] = matching;
      }
    });
    return filtered;
  }, [topicsByDiscipline, searchQuery]);

  // Obter nomes dos tópicos selecionados para display
  const selectedTopicNames = useMemo(() => {
    const names: string[] = [];
    Object.values(topicsByDiscipline).flat().forEach((topic) => {
      if (selectedTopicIds.includes(topic.id)) {
        names.push(topic.name);
      }
    });
    return names;
  }, [topicsByDiscipline, selectedTopicIds]);

  const toggleDiscipline = (disciplineId: string) => {
    setExpandedDisciplines((prev) => {
      const next = new Set(prev);
      if (next.has(disciplineId)) {
        next.delete(disciplineId);
      } else {
        next.add(disciplineId);
      }
      return next;
    });
  };

  const handleTopicChange = (topicId: string, checked: boolean) => {
    let newSelection: string[];

    if (checked) {
      if (allowMultiple) {
        newSelection = [...selectedTopicIds, topicId];
      } else {
        newSelection = [topicId];
      }
    } else {
      newSelection = selectedTopicIds.filter((id) => id !== topicId);
    }
    onChange(newSelection);
  };

  const isTopicSelected = (topicId: string) => selectedTopicIds.includes(topicId);

  const getSelectedCountForDiscipline = (disciplineId: string) => {
    const topics = topicsByDiscipline[disciplineId] || [];
    return topics.filter((t) => selectedTopicIds.includes(t.id)).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando disciplinas e tópicos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rf-card p-4 border-border/50">
        <div className="flex items-center gap-2 text-sm text-destructive mb-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Erro ao carregar conteúdo</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{error}</p>
        <button onClick={handleRetry} className="btn-ghost text-sm">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (disciplines.length === 0) {
    return (
      <div className="rf-card p-6 text-center border-border/50">
        <svg className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <p className="text-muted-foreground text-sm">Nenhuma disciplina cadastrada.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Crie disciplinas e tópicos na aba <strong>Conteúdos</strong>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar tópicos..."
          className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Selected counter */}
      {selectedTopicIds.length > 0 && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <span>{selectedTopicIds.length} tópico{selectedTopicIds.length !== 1 ? "s" : ""} selecionado{selectedTopicIds.length !== 1 ? "s" : ""}</span>
          {allowMultiple && (
            <button
              onClick={() => onChange([])}
              className="ml-2 text-primary hover:underline"
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Disciplines tree */}
      <div className="space-y-1">
        {disciplines.map((discipline) => {
          const topics = filteredTopicsByDiscipline[discipline.id] || topicsByDiscipline[discipline.id] || [];
          const isExpanded = expandedDisciplines.has(discipline.id);
          const selectedCount = getSelectedCountForDiscipline(discipline.id);
          const hasMatches = searchQuery && topics.length > 0;

          return (
            <div key={discipline.id} className="rf-card border-border/50">
              <button
                type="button"
                onClick={() => toggleDiscipline(discipline.id)}
                className="w-full flex items-center justify-between p-3 text-left"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="font-medium text-sm">{discipline.name}</span>
                  {(selectedCount > 0 || hasMatches) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {selectedCount > 0 ? `${selectedCount} selecionado${selectedCount !== 1 ? "s" : ""}` : `${topics.length} resultado${topics.length !== 1 ? "s" : ""}`}
                    </span>
                  )}
                </div>
              </button>

              {(isExpanded || hasMatches) && topics.length > 0 && (
                <div className="pl-10 space-y-1 pb-2 border-l border-border/30 ml-6">
                  {topics.map((topic) => (
                    <label
                      key={topic.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                    >
                      <input
                        type={allowMultiple ? "checkbox" : "radio"}
                        checked={isTopicSelected(topic.id)}
                        onChange={(e) => handleTopicChange(topic.id, e.target.checked)}
                        className="h-4 w-4 text-primary border-border rounded focus:ring-2 focus:ring-primary"
                      />
                      <span className="text-sm flex-1 truncate">{topic.name}</span>
                    </label>
                  ))}
                </div>
              )}

              {(isExpanded || hasMatches) && topics.length === 0 && (
                <div className="pl-10 pb-2 text-xs text-muted-foreground border-l border-border/30 ml-6">
                  {searchQuery ? "Nenhum tópico encontrado" : "Nenhum tópico cadastrado nesta disciplina"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedTopicNames.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <p className="text-xs text-muted-foreground mb-2">Selecionados:</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedTopicNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}