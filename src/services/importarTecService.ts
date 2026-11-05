// src/services/importarTecService.ts
import JSZip from 'jszip';
import { importarQuestoesNoBanco } from './bancoQuestoesService';
import { uploadImagemR2 } from './r2StorageService';
import type { QuestaoParsed } from './pdfBancoParser';

export interface ResultadoImportacaoTec {
  success: boolean;
  novas: number;
  jaExistentes: number;
  erros: number;
  error?: string;
}

export async function importarArquivoTec(
  file: File,
  userId: string,
  onProgress: (mensagem: string, porcentagem: number) => void
): Promise<ResultadoImportacaoTec> {
  
  try {
    onProgress("Lendo arquivo ZIP...", 5);
    const zip = new JSZip();
    const zipAberto = await zip.loadAsync(file);

    const nomeArquivoJson = Object.keys(zipAberto.files).find(nome => nome.endsWith('questoes_tec.json'));
    if (!nomeArquivoJson) {
      return { success: false, novas: 0, jaExistentes: 0, erros: 0, error: "Arquivo questoes_tec.json não encontrado no ZIP." };
    }

    onProgress("Processando questões...", 10);
    const conteudoJsonStr = await zipAberto.files[nomeArquivoJson].async("string");
    let questoes: QuestaoParsed[] = JSON.parse(conteudoJsonStr);

    const totalQuestoes = questoes.length;
    
    for (let i = 0; i < totalQuestoes; i++) {
      const q = questoes[i];
      const porcentagemAtual = 10 + Math.floor(((i + 1) / totalQuestoes) * 80);
      onProgress(`Processando imagens da questão ${i + 1} de ${totalQuestoes}...`, porcentagemAtual);

      const regexImagem = /\[IMAGEM:\s*(.+?)\]/g;

      // Imagens do Enunciado
      if (q.enunciado) {
        const match = regexImagem.exec(q.enunciado);
        if (match) {
          const nomeImagem = match[1].trim();
          const imagemNoZip = zipAberto.file(`imagens/${nomeImagem}`);
          
          if (imagemNoZip) {
            const blob = await imagemNoZip.async("blob");
            // Passando o q.hash_dedup aqui para gerar o nome único
            const urlR2 = await uploadImagemR2(blob, nomeImagem, userId, q.hash_dedup);
            if (urlR2) {
              q.enunciado = q.enunciado.replace(match[0], `[IMAGEM: ${urlR2}]`);
              q.imagem_url = urlR2;
              q.__nome_imagem = urlR2;
            }
          }
        }
      }

      // Imagens do Comentário
      if (q.comentario) {
        const matches = [...q.comentario.matchAll(regexImagem)];
        for (const match of matches) {
          const nomeImagem = match[1].trim();
          const imagemNoZip = zipAberto.file(`imagens/${nomeImagem}`);
          
          if (imagemNoZip) {
            const blob = await imagemNoZip.async("blob");
            // Passando o q.hash_dedup aqui também
            const urlR2 = await uploadImagemR2(blob, nomeImagem, userId, q.hash_dedup);
            if (urlR2) {
              q.comentario = q.comentario.replace(match[0], `[IMAGEM: ${urlR2}]`);
            }
          }
        }
      }
    }

    onProgress("Salvando questões no Banco de Questões...", 95);
    const resultado = await importarQuestoesNoBanco(questoes, userId);

    onProgress("Concluído!", 100);

    return {
      success: resultado.success,
      novas: resultado.novas,
      jaExistentes: resultado.jaExistentes,
      erros: resultado.erros,
      error: resultado.error
    };

  } catch (e: any) {
    console.error("Erro ao importar TEC:", e);
    return { success: false, novas: 0, jaExistentes: 0, erros: 0, error: e.message || "Erro desconhecido ao descompactar o arquivo." };
  }
}