
/**
 * Helper robusto para forçar o download de arquivos no navegador.
 * Lida com criação de Blob, URL temporária e limpeza de memória.
 */
export const downloadFile = (filename: string, content: string | Blob, mimeType: string) => {
    try {
      // Se for string, adiciona BOM para garantir UTF-8 correto no Excel/Word (Windows)
      let finalContent = content;
      if (typeof content === 'string' && (mimeType.includes('text') || mimeType.includes('msword'))) {
         // Adiciona Byte Order Mark (BOM) para UTF-8 se não existir
         if (!content.startsWith('\uFEFF')) {
             finalContent = '\uFEFF' + content;
         }
      }
  
      const blob = typeof finalContent === 'string' 
        ? new Blob([finalContent], { type: mimeType }) 
        : finalContent;
  
      // Cria URL temporária
      const url = URL.createObjectURL(blob);
  
      // Cria elemento âncora invisível
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      
      // Dispara o download
      link.click();
  
      // Limpeza de memória (delay para garantir que o browser processou o clique)
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 200);
      
      return true;
    } catch (err) {
      console.error("Erro fatal no downloadFile:", err);
      throw new Error("Falha ao iniciar o download do arquivo no navegador.", {
        cause: err,
      });
    }
  };
