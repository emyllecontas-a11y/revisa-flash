import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/db";
import {
  subscribeStudyThemeTimelines,
  createStudyThemeTimeline,
  updateStudyThemeTimeline,
  upsertStudyThemeTimeline,
  deleteStudyThemeTimeline,
} from "@/services/studyPlanService";
import type { StudyThemeTimeline, PeriodType } from "@/types/study-plan";

export function useThemeTimeline(userId: string | null) {
  const [timelines, setTimelines] = useState<StudyThemeTimeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) {
      setTimelines([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const db = await getDb();
      const docs = await db.study_theme_timelines
        .find({
          selector: { user_id: userId, isDeleted: { $ne: true } },
        })
        .exec();
      setTimelines(docs.map((d) => d.toJSON() as StudyThemeTimeline));
    } catch (e) {
      console.error("Erro ao carregar linha do tempo de temas:", e);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial load
  useEffect(() => {
    reload();
  }, [reload]);

  // Reactive subscription via RxDB
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let subscription: { unsubscribe: () => void } | null = null;
    let cancelado = false;

    (async () => {
      try {
        const db = await getDb();
        if (cancelado || !db.collections?.study_theme_timelines) return;
        subscription = db.collections.study_theme_timelines.$.subscribe(() => {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(reload, 500);
        });
      } catch (e) {
        console.warn("Erro ao ouvir study_theme_timelines:", e);
      }
    })();

    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [reload]);

  const create = useCallback(
    async (
      data: Omit<StudyThemeTimeline, "id" | "user_id" | "created_at" | "updated_at" | "isDeleted">,
    ) => {
      await createStudyThemeTimeline(data);
    },
    [],
  );

  const update = useCallback(
    async (
      id: string,
      data: Partial<Omit<StudyThemeTimeline, "id" | "user_id" | "created_at">>,
    ) => {
      await updateStudyThemeTimeline(id, data);
    },
    [],
  );

  const upsert = useCallback(
    async (
      data: Omit<StudyThemeTimeline, "id" | "user_id" | "created_at" | "updated_at" | "isDeleted">,
    ) => {
      await upsertStudyThemeTimeline(data);
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await deleteStudyThemeTimeline(id);
  }, []);

  // Helper: get themes for a specific period
  const getThemesForPeriod = useCallback(
    (periodType: PeriodType, periodStart: string) => {
      const timeline = timelines.find(
        (t) => t.period_type === periodType && t.period_start === periodStart,
      );
      return timeline?.themes ?? [];
    },
    [timelines],
  );

  return { timelines, isLoading, reload, create, update, upsert, remove, getThemesForPeriod };
}
