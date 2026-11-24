process.env.TZ = 'America/Fortaleza';
import { describe, it, expect } from 'vitest';
import { getLastClosedWeek, formatDDMM } from '@/utils/dateHelpers';

describe('weeklyErrorNotebookService - Datas', () => {
  describe('getLastClosedWeek', () => {
    it('deve retornar a semana anterior se for sábado antes das 06:00', () => {
      const now = new Date('2026-11-28T05:59:00-03:00');
      const week = getLastClosedWeek(now);
      expect(formatDDMM(week.weekStart)).toBe('16/11');
      expect(formatDDMM(week.weekEnd)).toBe('20/11');
    });

    it('deve retornar a semana atual se for sábado a partir das 06:00', () => {
      const now = new Date('2026-11-28T06:00:00-03:00');
      const week = getLastClosedWeek(now);
      expect(formatDDMM(week.weekStart)).toBe('23/11');
      expect(formatDDMM(week.weekEnd)).toBe('27/11');
    });

    it('deve retornar a semana anterior se for domingo', () => {
      const now = new Date('2026-11-22T12:00:00-03:00');
      const week = getLastClosedWeek(now);
      expect(formatDDMM(week.weekStart)).toBe('16/11');
      expect(formatDDMM(week.weekEnd)).toBe('20/11');
    });

    it('deve retornar a semana anterior se for sexta-feira (sábado ainda não chegou)', () => {
      const now = new Date('2026-11-27T12:00:00-03:00');
      const week = getLastClosedWeek(now);
      expect(formatDDMM(week.weekStart)).toBe('16/11');
      expect(formatDDMM(week.weekEnd)).toBe('20/11');
    });

    it('deve retornar a semana de 23/11 a 27/11 no período de sábado 06:00 (28/11) até sábado 06:00 (05/12)', () => {
       const now1 = new Date('2026-11-28T06:00:00-03:00');
       expect(formatDDMM(getLastClosedWeek(now1).weekStart)).toBe('23/11');

       const now2 = new Date('2026-12-05T05:59:00-03:00');
       expect(formatDDMM(getLastClosedWeek(now2).weekStart)).toBe('23/11');

       const now3 = new Date('2026-12-05T06:00:00-03:00');
       expect(formatDDMM(getLastClosedWeek(now3).weekStart)).toBe('30/11');
    });
  });
});