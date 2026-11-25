// src/utils/studyRatsFormat.ts
// Formatações visíveis do Study Rats (movidas do protótipo mock-data.ts).

/** 90 -> "1h30min" | 60 -> "1h" | 45 -> "45min". */
export function fmtDuracao(min: number): string {
  const total = Number.isFinite(min) ? Math.max(0, Math.round(min)) : 0;
  if (total < 60) return `${total}min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto ? `${horas}h${String(resto).padStart(2, '0')}min` : `${horas}h`;
}

/** "agora", "há 3h", "há 2d"… a partir da data/hora atual do dispositivo. */
export function tempoRelativo(iso: string, agora: Date = new Date()): string {
  const alvo = new Date(iso);
  if (Number.isNaN(alvo.getTime())) return '';

  const diffMs = agora.getTime() - alvo.getTime();
  if (diffMs < 60_000) return 'agora';

  const minutos = Math.floor(diffMs / 60_000);
  if (minutos < 60) return `há ${minutos}min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;

  const dias = Math.floor(horas / 24);
  if (dias < 7) return `há ${dias}d`;

  return alvo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
