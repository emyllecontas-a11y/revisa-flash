// src/services/conteudoSugestaoService.test.ts
// Testes para conteudoSugestaoService

import { describe, it, expect } from 'vitest';
import {
  normalizarNome,
  calcularConteudoNovo,
  EntradaConteudo,
  DisciplinaExistente,
  TopicoExistente,
} from './conteudoSugestaoService';

describe('conteudoSugestaoService', () => {
  // Helper para criar disciplinas existentes
  const d = (id: string, name: string): DisciplinaExistente => ({
    id,
    name,
    normName: normalizarNome(name),
  });

  // Helper para criar tópicos existentes
  const t = (id: string, name: string, discipline_id: string): TopicoExistente => ({
    id,
    name,
    discipline_id,
    normName: normalizarNome(name),
  });

  describe('normalizarNome', () => {
    it('remove acentos e converte para minúsculas', () => {
      expect(normalizarNome('Anatomia')).toBe('anatomia');
      expect(normalizarNome('ANATOMIA')).toBe('anatomia');
      expect(normalizarNome('anatomia')).toBe('anatomia');
      expect(normalizarNome('AnAtOmIa')).toBe('anatomia');
    });

    it('remove acentos', () => {
      expect(normalizarNome('Anátomia')).toBe('anatomia');
      expect(normalizarNome('Patologia Oral')).toBe('patologia oral');
      expect(normalizarNome('Fisiologia')).toBe('fisiologia');
    });

    it('trim e espaços múltiplos', () => {
      expect(normalizarNome('  Anatomia  ')).toBe('anatomia');
      expect(normalizarNome('Anatomia   Oral')).toBe('anatomia oral');
      expect(normalizarNome('\tAnatomia\n')).toBe('anatomia');
    });
  });

  describe('calcularConteudoNovo', () => {
    const disciplinasExistentes: DisciplinaExistente[] = [
      d('disc-1', 'Anatomia'),
      d('disc-2', 'Patologia Oral'),
    ];

    const topicosExistentes: TopicoExistente[] = [
      t('top-1', 'Sistema Nervoso', 'disc-1'),
      t('top-2', 'Lesões Fundamentais', 'disc-2'),
    ];

    it('disciplina nova e tópico novo', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Fisiologia', topico: 'Sistema Cardiovascular' },
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.disciplinasNovas).toEqual(['Fisiologia']);
      expect(result.topicosNovos).toEqual([{ disciplina: 'Fisiologia', nome: 'Sistema Cardiovascular' }]);
      expect(result.mapaExistentes.size).toBe(0);
    });

    it('disciplina existente e tópico existente', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Anatomia', topico: 'Sistema Nervoso' },
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.disciplinasNovas).toEqual([]);
      expect(result.topicosNovos).toEqual([]);
      expect(result.mapaExistentes.get('anatomia')).toBe('disc-1');
      expect(result.mapaExistentes.get('disc-1::sistema nervoso')).toBe('top-1');
    });

    it('disciplina existente mas tópico novo', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Anatomia', topico: 'Sistema Digestório' },
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.disciplinasNovas).toEqual([]);
      expect(result.topicosNovos).toEqual([{ disciplina: 'Anatomia', nome: 'Sistema Digestório' }]);
      expect(result.mapaExistentes.get('anatomia')).toBe('disc-1');
      expect(result.mapaExistentes.has('disc-1::sistema digestório')).toBe(false);
    });

    it('mesma disciplina repetida no arquivo (não duplica)', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Fisiologia', topico: 'Sistema Cardiovascular' },
        { disciplina: 'Fisiologia', topico: 'Sistema Respiratório' },
        { disciplina: 'Fisiologia' }, // só disciplina
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.disciplinasNovas).toEqual(['Fisiologia']);
      expect(result.topicosNovos).toEqual([
        { disciplina: 'Fisiologia', nome: 'Sistema Cardiovascular' },
        { disciplina: 'Fisiologia', nome: 'Sistema Respiratório' },
      ]);
    });

    it('mesmo tópico em disciplinas diferentes NÃO conflita', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Fisiologia', topico: 'Introdução' },
        { disciplina: 'Bioquímica', topico: 'Introdução' },
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.disciplinasNovas).toEqual(['Fisiologia', 'Bioquímica']);
      expect(result.topicosNovos).toEqual([
        { disciplina: 'Fisiologia', nome: 'Introdução' },
        { disciplina: 'Bioquímica', nome: 'Introdução' },
      ]);
    });

    it('tópico existente não vira novo', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Anatomia', topico: 'Sistema Nervoso' },
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.topicosNovos).toEqual([]);
      expect(result.mapaExistentes.get('disc-1::sistema nervoso')).toBe('top-1');
    });

    it('registro deletado é ignorado (não está na lista de existentes)', () => {
      // Simula que "Anatomia" foi deletada (não está em disciplinasExistentes)
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Anatomia', topico: 'Sistema Nervoso' },
      ];

      // disciplinasExistentes vazio = disciplina deletada
      const result = calcularConteudoNovo(entradas, [], topicosExistentes);

      expect(result.disciplinasNovas).toEqual(['Anatomia']);
      expect(result.topicosNovos).toEqual([{ disciplina: 'Anatomia', nome: 'Sistema Nervoso' }]);
    });

    it('bloco sem tópico gera só a disciplina', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Fisiologia' }, // sem tópico
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.disciplinasNovas).toEqual(['Fisiologia']);
      expect(result.topicosNovos).toEqual([]);
    });

    it('case-insensitive e acentos no match de existentes', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'ANATOMIA', topico: 'SISTEMA NERVOSO' },
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.disciplinasNovas).toEqual([]);
      expect(result.topicosNovos).toEqual([]);
      expect(result.mapaExistentes.get('anatomia')).toBe('disc-1');
      expect(result.mapaExistentes.get('disc-1::sistema nervoso')).toBe('top-1');
    });

    it('ordem de primeira ocorrência preservada para disciplinas novas', () => {
      const entradas: EntradaConteudo[] = [
        { disciplina: 'Zootecnia', topico: 'A' },
        { disciplina: 'Anatomia', topico: 'B' }, // já existe
        { disciplina: 'Fisiologia', topico: 'C' },
        { disciplina: 'Zootecnia', topico: 'D' }, // repetida
      ];

      const result = calcularConteudoNovo(entradas, disciplinasExistentes, topicosExistentes);

      expect(result.disciplinasNovas).toEqual(['Zootecnia', 'Fisiologia']);
    });
  });
});