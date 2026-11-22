import { useState, useEffect, useCallback, useMemo } from "react";
import { getDb } from "@/lib/db";
import {
  subscribeStudyWeeklyBlocks,
  subscribeStudyExtraEvents,
  subscribeStudyThemeTimelines,
  subscribeStudyTasks,
  subscribeStudyOccurrences,
  subscribeStudyPlanPauses,
} from "@/services/studyPlanService";
import { generateWeekSchedule, type GenerateWeekScheduleInput, type WeekSchedule } from "@/utils/generateWeekSchedule";
import type {
  StudyWeeklyBlock,
  StudyExtraEvent,
  StudyThemeTimeline,
  StudyTask,
  StudyOccurrence,
  StudyPlanPause,
} from "@/types/study-plan";

// Topic interface (defined inline in conteudo.tsx, redefined here for RxDB subscription)
interface Topic {
  id: string;
  name: string;
  discipline_id: string;
  user_id: string;
  status: string;
  planned_date: string | null;
  createdAt: string;
  updated_at: string;
  isDeleted?: boolean;
  order?: number;
}

export function useWeekSchedule(userId: string | null, weekStart: string) {
  const [blocks, setBlocks] = useState<StudyWeeklyBlock[]>([]);
  const [extras, setExtras] = useState<StudyExtraEvent[]>([]);
  const [timelines, setTimelines] = useState<StudyThemeTimeline[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [occurrences, setOccurrences] = useState<StudyOccurrence[]>([]);
  const [pauses, setPauses] = useState<StudyPlanPause[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initial load
  const reload = useCallback(async () => {
    if (!userId) {
      setBlocks([]);
      setExtras([]);
      setTimelines([]);
      setTasks([]);
      setOccurrences([]);
      setPauses([]);
      setTopics([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const db = await getDb();

      const [blocksDocs, extrasDocs, timelinesDocs, tasksDocs, occurrencesDocs, pausesDocs, topicsDocs] = await Promise.all([
        db.study_weekly_blocks.find({ selector: { user_id: userId, isDeleted: { $ne: true } } }).exec(),
        db.study_extra_events.find({ selector: { user_id: userId, isDeleted: { $ne: true } } }).exec(),
        db.study_theme_timelines.find({ selector: { user_id: userId, isDeleted: { $ne: true } } }).exec(),
        db.study_tasks.find({ selector: { user_id: userId, isDeleted: { $ne: true } } }).exec(),
        db.study_occurrences.find({ selector: { user_id: userId, isDeleted: { $ne: true } } }).exec(),
        db.study_plan_pauses.find({ selector: { user_id: userId, isDeleted: { $ne: true } } }).exec(),
        db.topics.find({ selector: { user_id: userId, isDeleted: { $ne: true } } }).exec(),
      ]);

      setBlocks(blocksDocs.map((d) => d.toJSON() as StudyWeeklyBlock));
      setExtras(extrasDocs.map((d) => d.toJSON() as StudyExtraEvent));
      setTimelines(timelinesDocs.map((d) => d.toJSON() as StudyThemeTimeline));
      setTasks(tasksDocs.map((d) => d.toJSON() as StudyTask));
      setOccurrences(occurrencesDocs.map((d) => d.toJSON() as StudyOccurrence));
      setPauses(pausesDocs.map((d) => d.toJSON() as StudyPlanPause));
      setTopics(topicsDocs.map((d) => d.toJSON() as Topic));
    } catch (e) {
      console.error("Erro ao carregar dados do plano de estudos:", e);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Reactive subscriptions via RxDB
  useEffect(() => {
    if (!userId) return;

    let cancelado = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const subscriptions: Array<{ unsubscribe: () => void }> = [];

    (async () => {
      try {
        const db = await getDb();
        if (cancelado) return;

        const setupSubscription = <T>(
          collection: string,
          setter: (data: T[]) => void,
        ) => {
          if (!db.collections?.[collection]) return;
          const sub = db.collections[collection].$.subscribe(() => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(reload, 500);
          });
          subscriptions.push(sub);
        };

        setupSubscription("study_weekly_blocks", setBlocks);
        setupSubscription("study_extra_events", setExtras);
        setupSubscription("study_theme_timelines", setTimelines);
        setupSubscription("study_tasks", setTasks);
        setupSubscription("study_occurrences", setOccurrences);
        setupSubscription("study_plan_pauses", setPauses);
        setupSubscription("topics", setTopics);
      } catch (e) {
        console.warn("Erro ao configurar subscriptions do plano de estudos:", e);
      }
    })();

    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
      subscriptions.forEach((s) => s.unsubscribe());
    };
  }, [userId, reload]);

  // Gerar agenda da semana combinando todos os dados com o motor puro
  const weekSchedule = useMemo((): WeekSchedule | null => {
    if (!userId || isLoading) return null;

    // Criar mapa topic_id -> topic_name para resolução de nomes
    const topicsMap = new Map<string, string>();
    for (const topic of topics) {
      topicsMap.set(topic.id, topic.name);
    }

    const input: GenerateWeekScheduleInput = {
      weekStart,
      blocks,
      extras,
      timelines,
      tasks,
      occurrences,
      pauses,
      topics: topicsMap,
    };

    return generateWeekSchedule(input);
  }, [userId, isLoading, weekStart, blocks, extras, timelines, tasks, occurrences, pauses, topics]);

  return { weekSchedule, isLoading, reload };
}