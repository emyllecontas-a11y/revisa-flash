// src/services/conteudoSugestaoService.test.ts
// Testes para conteudoSugestaoService

import { describe, it, expect } from 'vitest';
import {
  normalizarNome,
  calcularConteudoNovo,
  montarEntradasDaTaxonomia,
  EntradaConteudo,
  DisciplinaExistente,
  TopicoExistente,
  SelecaoTaxonomia,
  TaxonomiaDisciplina,
  TaxonomiaMateria,
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

  describe('montarEntradasDaTaxonomia', () => {
    // Taxonomia de teste
    const taxonomia: TaxonomiaDisciplina[] = [
      {
        disciplina: 'Area1',
        materias: [
          { nome: 'Materia A', topicos: [{ nome: 'Topico A1', subtopicos: [] }, { nome: 'Topico A2', subtopicos: [] }] },
          { nome: 'Materia B', topicos: [{ nome: 'Topico B1', subtopicos: [] }] },
          { nome: 'Materia Sem Topicos', topicos: [] },
        ],
      },
      {
        disciplina: 'Area2',
        materias: [
          { nome: 'Materia A', topicos: [{ nome: 'Topico A1', subtopicos: [] }, { nome: 'Topico A3', subtopicos: [] }] }, // mesma matéria, tópicos diferentes
          { nome: 'Materia C', topicos: [] },
        ],
      },
    ];

    it('matéria sem tópicos marcados gera só a disciplina', () => {
      const selecao: SelecaoTaxonomia = {
        areas: [],
        materias: [{ area: 'Area1', nome: 'Materia Sem Topicos' }],
        topicos: [],
      };

      const result = montarEntradasDaTaxonomia(selecao, taxonomia);

      expect(result).toEqual([{ disciplina: 'Materia Sem Topicos' }]);
    });

    it('matéria com tópicos marcados gera disciplina + tópicos', () => {
      const selecao: SelecaoTaxonomia = {
        areas: [],
        materias: [{ area: 'Area1', nome: 'Materia A' }],
        topicos: [
          { area: 'Area1', materia: 'Materia A', nome: 'Topico A1' },
          { area: 'Area1', materia: 'Materia A', nome: 'Topico A2' },
        ],
      };

      const result = montarEntradasDaTaxonomia(selecao, taxonomia);

      expect(result).toEqual([
        { disciplina: 'Materia A', topico: 'Topico A1' },
        { disciplina: 'Materia A', topico: 'Topico A2' },
      ]);
    });

    it('mesma matéria duplicada em duas áreas é deduplicada', () => {
      const selecao: SelecaoTaxonomia = {
        areas: [],
        materias: [
          { area: 'Area1', nome: 'Materia A' },
          { area: 'Area2', nome: 'Materia A' }, // mesma matéria, área diferente
        ],
        topicos: [
          { area: 'Area1', materia: 'Materia A', nome: 'Topico A1' },
          { area: 'Area2', materia: 'Materia A', nome: 'Topico A3' },
        ],
      };

      const result = montarEntradasDaTaxonomia(selecao, taxonomia);

      // Deve aparecer uma vez, com todos os tópicos únicos
      expect(result).toEqual([
        { disciplina: 'Materia A', topico: 'Topico A1' },
        { disciplina: 'Materia A', topico: 'Topico A3' },
      ]);
    });

    it('acentos e maiúsculas não duplicam', () => {
      const selecao: SelecaoTaxonomia = {
        areas: [],
        materias: [
          { area: 'Area1', nome: 'MATERIA A' },
          { area: 'Area1', nome: 'matéria a' }, // mesmo nome, case/acento diferente
        ],
        topicos: [
          { area: 'Area1', materia: 'MATERIA A', nome: 'TOPICO A1' },
          { area: 'Area1', materia: 'matéria a', nome: 'tópico a1' }, // mesmo tópico
        ],
      };

      const result = montarEntradasDaTaxonomia(selecao, taxonomia);

      expect(result).toEqual([
        { disciplina: 'Materia A', topico: 'Topico A1' },
      ]);
    });

    it('múltiplas matérias com e sem tópicos', () => {
      const selecao: SelecaoTaxonomia = {
        areas: [],
        materias: [
          { area: 'Area1', nome: 'Materia A' },
          { area: 'Area1', nome: 'Materia B' },
          { area: 'Area1', nome: 'Materia Sem Topicos' },
        ],
        topicos: [
          { area: 'Area1', materia: 'Materia A', nome: 'Topico A1' },
          { area: 'Area1', materia: 'Materia B', nome: 'Topico B1' },
        ],
      };

      const result = montarEntradasDaTaxonomia(selecao, taxonomia);

      expect(result).toEqual([
        { disciplina: 'Materia A', topico: 'Topico A1' },
        { disciplina: 'Materia B', topico: 'Topico B1' },
        { disciplina: 'Materia Sem Topicos' },
      ]);
    });

    it('tópicos de matérias não selecionadas são ignorados', () => {
      const selecao: SelecaoTaxonomia = {
        areas: [],
        materias: [{ area: 'Area1', nome: 'Materia A' }],
        topicos: [
          { area: 'Area1', materia: 'Materia A', nome: 'Topico A1' },
          { area: 'Area1', materia: 'Materia B', nome: 'Topico B1' }, // Materia B não está selecionada
        ],
      };

      const result = montarEntradasDaTaxonomia(selecao, taxonomia);

      expect(result).toEqual([
        { disciplina: 'Materia A', topico: 'Topico A1' },
      ]);
    });
  });
});