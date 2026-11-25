import { getDb } from "@/lib/db";

export interface DisciplinaLocal {
  id: string;
  name: string;
}

/**
 * Lê as disciplinas do banco local (RxDB) — a mesma fonte usada pela aba
 * Listas / Disciplinas. Funciona offline e não depende de RLS/token do Supabase.
 */
export async function getDisciplinesLocal(
  userId: string,
): Promise<{ success: boolean; data?: DisciplinaLocal[]; error?: string }> {
  try {
    const db = await getDb();
    const docs = await db.disciplines
      .find({ selector: { user_id: userId, isDeleted: { $ne: true } } })
      .exec();
    const data = docs
      .map((d: any) => ({ id: d.id as string, name: d.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { success: true, data };
  } catch (error: any) {
    console.error("[disciplinesLocal] Erro ao buscar disciplinas locais:", error);
    return { success: false, error: error?.message ?? "Erro desconhecido" };
  }
}