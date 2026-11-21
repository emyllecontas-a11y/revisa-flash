import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/db";
import {
  subscribeStudyTasks,
  createStudyTask,
  updateStudyTask,
  deleteStudyTask,
} from "@/services/studyPlanService";
import type { StudyTask } from "@/types/study-plan";

export function useStudyTasks(userId: string | null) {
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const db = await getDb();
      const docs = await db.study_tasks
        .find({
          selector: { user_id: userId, isDeleted: { $ne: true } },
        })
        .exec();
      setTasks(docs.map((d) => d.toJSON() as StudyTask));
    } catch (e) {
      console.error("Erro ao carregar tarefas de estudo:", e);
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
        if (cancelado || !db.collections?.study_tasks) return;
        subscription = db.collections.study_tasks.$.subscribe(() => {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(reload, 500);
        });
      } catch (e) {
        console.warn("Erro ao ouvir study_tasks:", e);
      }
    })();

    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [reload]);

  const create = useCallback(
    async (data: Omit<StudyTask, "id" | "user_id" | "created_at" | "updated_at" | "isDeleted">) => {
      await createStudyTask(data);
    },
    [],
  );

  const update = useCallback(
    async (id: string, data: Partial<Omit<StudyTask, "id" | "user_id" | "created_at">>) => {
      await updateStudyTask(id, data);
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await deleteStudyTask(id);
  }, []);

  return { tasks, isLoading, reload, create, update, remove };
}
