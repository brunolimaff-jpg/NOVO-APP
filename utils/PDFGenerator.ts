/**
 * PDFGenerator — renderização programática com jsPDF (sem html2canvas)
 *
 * Converte markdown diretamente em instruções de desenho jsPDF.
 * Suporta: h1/h2/h3/h4, bold, italic, bold+italic, links, `code`,
 *          listas bullet/numeradas, blockquotes, réguas (---), parágrafos.
 */

import { jsPDF } from 'jspdf';
import { sanitizeMermaidCode } from './mermaid';

// ─── Paleta de cores Scout 360 ─────────────────────────────────────────────
const C = {
  primaryDark: [6, 79, 58] as [number, number, number],   // #064e3b
  primary:     [5, 150, 105] as [number, number, number], // #059669
  body:        [30, 41, 59] as [number, number, number],  // #1e293b
  muted:       [107, 114, 128] as [number, number, number], // #6b7280
  subtle:      [229, 231, 235] as [number, number, number], // #e5e7eb
  white:       [255, 255, 255] as [number, number, number],
  lightGreen:  [240, 253, 244] as [number, number, number], // #f0fdf4
  codeGray:    [248, 250, 252] as [number, number, number],
  lightAccent: [167, 243, 208] as [number, number, number], // #a7f3d0
};

type RGB = [number, number, number];

interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: RGB;
}

interface SourceLink {
  text: string;
  url: string;
}

export class PDFGenerator {
  private doc: jsPDF;
  private y: number;
  private static mermaidInitialized = false;

  private readonly ML = 18;  // margin left
  private readonly MR = 18;  // margin right
  private readonly MT = 22;  // margin top
  private readonly MB = 22;  // margin bottom
  private readonly PW = 210; // page width (A4)
  private readonly PH = 297; // page height (A4)
  private readonly CW: number; // content width

  constructor() {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    this.CW = this.PW - this.ML - this.MR;
    this.y = this.MT;
  }

  // ─── Utilitários de cor ───────────────────────────────────────────────────

  private tc(rgb: RGB) { this.doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
  private fc(rgb: RGB) { this.doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
  private dc(rgb: RGB) { this.doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }

  // ─── Controle de página ──────────────────────────────────────────────────

  private ensureSpace(h: number) {
    if (this.y + h > this.PH - this.MB) {
      this.doc.addPage();
      this.y = this.MT;
    }
  }

  // ─── Cabeçalho do documento ───────────────────────────────────────────────

  addHeader(companyName: string, dateLine: string) {
    // Caixa verde escuro
    this.fc(C.primaryDark);
    this.doc.roundedRect(this.ML, this.y, this.CW, 24, 3, 3, 'F');

    // Rótulo "SENIOR SCOUT 360"
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7.5);
    this.tc(C.lightAccent);
    this.doc.text('SENIOR SCOUT 360  ·  INTELIGÊNCIA COMERCIAL', this.ML + 4, this.y + 6);

    // Nome da empresa
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.tc(C.white);
    const nameLines = this.doc.splitTextToSize(companyName, this.CW - 8);
    this.doc.text(nameLines[0] || companyName, this.ML + 4, this.y + 14);

    // Data e metadados
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.tc(C.lightAccent);
    this.doc.text(dateLine, this.ML + 4, this.y + 21);

    this.y += 29;

    // Barra "Uso interno"
    this.fc(C.lightGreen);
    this.dc(C.primary);
    this.doc.setLineWidth(0.3);
    this.doc.rect(this.ML, this.y, this.CW, 7, 'FD');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7.5);
    this.tc(C.primaryDark);
    this.doc.text(
      '\u26A0 USO INTERNO  —  Documento de apoio à prospecção. Não distribuir externamente.',
      this.ML + 3,
      this.y + 4.5,
    );
    this.y += 12;
  }

  // ─── Rodapé (aplicado a todas as páginas no final) ────────────────────────

  private applyFooters() {
    const total = this.doc.getNumberOfPages();
    const dateStr = new Date().toLocaleDateString('pt-BR');
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p);
      const fy = this.PH - 10;
      this.doc.setLineWidth(0.2);
      this.dc(C.subtle);
      this.doc.line(this.ML, fy - 3, this.PW - this.MR, fy - 3);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7);
      this.tc(C.muted);
      this.doc.text('🦅 Senior Scout 360 — Plataforma de Inteligência Comercial', this.ML, fy);
      this.doc.text(
        `Gerado via IA · ${dateStr} · Pág. ${p}/${total}`,
        this.PW - this.MR,
        fy,
        { align: 'right' },
      );
    }
  }

  // ─── Parser de inline markdown → TextRun[] ───────────────────────────────

  private parseInline(raw: string): TextRun[] {
    // Remove marcadores PORTA e artefatos de sistema
    const text = raw.replace(/\[\[PORTA:[^\]]+\]\]/g, '').replace(/^\s*[-—]\s*$/, '');
    const runs: TextRun[] = [];
    let i = 0;
    let buf = '';

    const flush = (bold?: boolean, italic?: boolean, color?: RGB) => {
      if (buf) { runs.push({ text: buf, bold, italic, color }); buf = ''; }
    };

    while (i < text.length) {
      // Bold+Italic ***
      if (text.startsWith('***', i)) {
        flush();
        const end = text.indexOf('***', i + 3);
        if (end !== -1) {
          runs.push({ text: text.slice(i + 3, end), bold: true, italic: true, color: C.primaryDark });
          i = end + 3; continue;
        }
      }
      // Bold **
      if (text.startsWith('**', i) && text[i + 2] !== '*') {
        flush();
        const end = text.indexOf('**', i + 2);
        if (end !== -1) {
          runs.push({ text: text.slice(i + 2, end), bold: true, color: C.primaryDark });
          i = end + 2; continue;
        }
      }
      // Italic *
      if (text[i] === '*' && text[i + 1] !== '*') {
        flush();
        const end = text.indexOf('*', i + 1);
        if (end !== -1 && text[end + 1] !== '*') {
          runs.push({ text: text.slice(i + 1, end), italic: true });
          i = end + 1; continue;
        }
      }
      // Link [text](url) → mostra só o texto em verde
      if (text[i] === '[') {
        const cb = text.indexOf(']', i);
        if (cb !== -1 && text[cb + 1] === '(') {
          const cp = text.indexOf(')', cb + 2);
          if (cp !== -1) {
            flush();
            runs.push({ text: text.slice(i + 1, cb), color: C.primary });
            i = cp + 1; continue;
          }
        }
      }
      // Code `...`
      if (text[i] === '`') {
        flush();
        const end = text.indexOf('`', i + 1);
        if (end !== -1) {
          runs.push({ text: ` ${text.slice(i + 1, end)} `, color: C.primaryDark });
          i = end + 1; continue;
        }
      }
      buf += text[i]; i++;
    }
    if (buf) runs.push({ text: buf });
    return runs;
  }

  // ─── Renderiza runs inline com quebra automática de linha ────────────────

  private renderRuns(runs: TextRun[], indent = 0, fs = 9.5, lh = 5) {
    const x0 = this.ML + indent;
    const maxW = this.PW - this.MR - x0;

    // Converte runs em palavras mantendo estilo
    type Word = TextRun & { w: number };
    const words: Word[] = [];

    for (const run of runs) {
      const style = run.bold && run.italic ? 'bolditalic' : run.bold ? 'bold' : 'normal';
      this.doc.setFont('helvetica', run.italic && !run.bold ? 'italic' : style);
      this.doc.setFontSize(fs);

      // Divide em segmentos (palavra + espaço à direita)
      const segs = run.text.match(/\S+\s*/g) ?? (run.text ? [run.text] : []);
      for (const seg of segs) {
        words.push({ ...run, text: seg, w: this.doc.getTextWidth(seg) });
      }
    }

    // Layout: acumula palavras em linha e quebra quando necessário
    let lineW = 0;
    let lineWords: Word[] = [];

    const flushLine = (last = false) => {
      if (!lineWords.length) return;
      this.ensureSpace(lh + 1);
      let lx = x0;
      for (const w of lineWords) {
        const style = w.bold && w.italic ? 'bolditalic' : w.bold ? 'bold' : 'normal';
        this.doc.setFont('helvetica', w.italic && !w.bold ? 'italic' : style);
        this.doc.setFontSize(fs);
        this.tc(w.color ?? C.body);
        this.doc.text(w.text, lx, this.y);
        lx += w.w;
      }
      lineWords = []; lineW = 0;
      if (!last) this.y += lh;
    };

    for (const word of words) {
      if (lineW + word.w > maxW && lineWords.length) {
        flushLine(false);
        this.y += lh;
      }
      lineWords.push(word);
      lineW += word.w;
    }
    flushLine(true);
    this.y += lh;
  }

  // ─── Renderer principal de markdown ──────────────────────────────────────

  // Sanitization delegated to shared utils/mermaid.ts — see sanitizeMermaidCode import

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    }) as Promise<T>;
  }

  private renderCodeBlock(lines: string[]) {
    const text = lines.join('\n').trimEnd() || '(bloco de código vazio)';
    const wrapped = this.doc.splitTextToSize(text, this.CW - 6);
    const blockHeight = Math.max(8, wrapped.length * 4.2 + 4);

    this.ensureSpace(blockHeight + 4);
    this.fc(C.codeGray);
    this.dc(C.subtle);
    this.doc.roundedRect(this.ML, this.y - 3, this.CW, blockHeight, 1.5, 1.5, 'FD');

    this.doc.setFont('courier', 'normal');
    this.doc.setFontSize(8);
    this.tc(C.body);
    this.doc.text(wrapped, this.ML + 3, this.y + 1);
    this.y += blockHeight + 2;
  }

  private async svgToPngDataUrl(svg: string): Promise<{ dataUrl: string; width: number; height: number }> {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      const img = await this.withTimeout(new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Falha ao converter SVG do Mermaid para imagem.'));
        image.src = url;
      }), 12000, 'Timeout ao carregar SVG do Mermaid para conversão PNG.');

      const viewBoxMatch = svg.match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)"/i);
      const vbWidth = viewBoxMatch?.[1] ? Number.parseFloat(viewBoxMatch[1]) : 0;
      const vbHeight = viewBoxMatch?.[2] ? Number.parseFloat(viewBoxMatch[2]) : 0;

      const width = img.naturalWidth || img.width || vbWidth || 1200;
      const height = img.naturalHeight || img.height || vbHeight || 700;
      const scale = 2;
      const maxCanvasWidth = 2800;
      const maxCanvasHeight = 2200;
      const scaledWidth = Math.min(Math.round(width * scale), maxCanvasWidth);
      const scaledHeight = Math.min(Math.round(height * scale), maxCanvasHeight);

      const canvas = document.createElement('canvas');
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Falha ao criar contexto canvas para Mermaid.');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      return {
        dataUrl: canvas.toDataURL('image/png', 0.95),
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async renderMermaidBlock(code: string) {
    const cleanCode = sanitizeMermaidCode(code);
    if (!cleanCode) {
      this.renderCodeBlock(['[Bloco mermaid inválido: revise a sintaxe.]', code]);
      return;
    }

    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Ambiente sem DOM para renderização do Mermaid.');
      }

      const mermaid = (await import('mermaid')).default;
      if (!PDFGenerator.mermaidInitialized) {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
        });
        PDFGenerator.mermaidInitialized = true;
      }

      const id = `pdf-mermaid-${Math.random().toString(36).slice(2, 9)}`;
      const { svg } = await this.withTimeout(
        mermaid.render(id, cleanCode),
        15000,
        'Timeout ao renderizar diagrama Mermaid.',
      );
      const { dataUrl, width, height } = await this.svgToPngDataUrl(svg);

      this.ensureSpace(8);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.tc(C.primaryDark);
      this.doc.text('Diagrama mermaid', this.ML, this.y);
      this.y += 4.5;

      let renderWidth = this.CW;
      let renderHeight = renderWidth * (height / width);
      const maxRenderHeight = this.PH - this.MT - this.MB - 12;
      if (renderHeight > maxRenderHeight) {
        renderHeight = maxRenderHeight;
        renderWidth = renderHeight * (width / height);
      }

      this.ensureSpace(renderHeight + 4);
      this.doc.addImage(dataUrl, 'PNG', this.ML, this.y, renderWidth, renderHeight, undefined, 'FAST');
      this.y += renderHeight + 4;
    } catch {
      this.renderCodeBlock([
        '[Diagrama mermaid não pôde ser convertido para PNG automaticamente. Código incluído para revisão.]',
        cleanCode,
      ]);
    }
  }

  async renderMarkdown(md: string) {
    const lines = md.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trimEnd();

      // Blocos de código fenced ```lang ... ```
      const fence = line.match(/^```(\w+)?\s*$/);
      if (fence) {
        const lang = (fence[1] || '').toLowerCase();
        const blockLines: string[] = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i].trim())) {
          blockLines.push(lines[i]);
          i += 1;
        }
        if (lang === 'mermaid' || lang === 'mmd') {
          await this.renderMermaidBlock(blockLines.join('\n'));
        } else {
          this.renderCodeBlock(blockLines);
        }
        continue;
      }

      // Ignora marcadores de sistema
      if (/^\[\[PORTA:/.test(line)) continue;

      // H1
      if (line.startsWith('# ')) {
        this.ensureSpace(14);
        this.y += 4;
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(14);
        this.tc(C.primaryDark);
        const wrapped = this.doc.splitTextToSize(line.slice(2), this.CW);
        this.doc.text(wrapped, this.ML, this.y);
        this.y += 6.5 * wrapped.length;
        this.dc(C.primary); this.doc.setLineWidth(0.5);
        this.doc.line(this.ML, this.y, this.PW - this.MR, this.y);
        this.y += 4;
        continue;
      }

      // H2
      if (line.startsWith('## ')) {
        this.ensureSpace(11);
        this.y += 3;
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(12);
        this.tc(C.primaryDark);
        const wrapped = this.doc.splitTextToSize(line.slice(3), this.CW);
        this.doc.text(wrapped, this.ML, this.y);
        this.y += 6 * wrapped.length + 2;
        continue;
      }

      // H3
      if (line.startsWith('### ')) {
        this.ensureSpace(9);
        this.y += 2;
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(11);
        this.tc(C.primaryDark);
        const wrapped = this.doc.splitTextToSize(line.slice(4), this.CW);
        this.doc.text(wrapped, this.ML, this.y);
        this.y += 5.5 * wrapped.length + 1;
        continue;
      }

      // H4
      if (line.startsWith('#### ')) {
        this.ensureSpace(8);
        this.y += 1.5;
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        this.tc(C.primaryDark);
        const wrapped = this.doc.splitTextToSize(line.slice(5), this.CW);
        this.doc.text(wrapped, this.ML, this.y);
        this.y += 5 * wrapped.length;
        continue;
      }

      // Régua horizontal ---
      if (/^[-*_]{3,}$/.test(line.trim())) {
        this.y += 3;
        this.dc(C.subtle); this.doc.setLineWidth(0.3);
        this.doc.line(this.ML, this.y, this.PW - this.MR, this.y);
        this.y += 4;
        continue;
      }

      // Blockquote > ...
      if (line.startsWith('> ')) {
        this.ensureSpace(8);
        const txt = line.slice(2);
        // Barra lateral verde
        this.fc(C.primary);
        this.doc.rect(this.ML, this.y - 4, 1.2, 6, 'F');
        this.doc.setFont('helvetica', 'italic');
        this.doc.setFontSize(9.5);
        this.tc([55, 65, 81]);
        const wrapped = this.doc.splitTextToSize(txt, this.CW - 6);
        this.doc.text(wrapped, this.ML + 5, this.y);
        this.y += 5 * wrapped.length + 1;
        continue;
      }

      // Lista bullet  - item  /  * item
      const bulletM = line.match(/^(\s*)([-*•])\s+(.+)/);
      if (bulletM) {
        this.ensureSpace(7);
        const depth = Math.floor(bulletM[1].length / 2);
        const indent = 4 + depth * 5;
        // Bolinha verde
        this.fc(C.primary);
        this.doc.circle(this.ML + indent - 1.5, this.y - 1.2, 1.0, 'F');
        this.renderRuns(this.parseInline(bulletM[3]), indent + 1, 9.5, 4.5);
        this.y -= 0.5; // compensa lh extra
        continue;
      }

      // Lista numerada  1. item
      const numM = line.match(/^(\s*)(\d+)\.\s+(.+)/);
      if (numM) {
        this.ensureSpace(7);
        const depth = Math.floor(numM[1].length / 2);
        const indent = 4 + depth * 5;
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.tc(C.primary);
        this.doc.text(`${numM[2]}.`, this.ML + indent - 1, this.y);
        this.renderRuns(this.parseInline(numM[3]), indent + 4, 9.5, 4.5);
        this.y -= 0.5;
        continue;
      }

      // Linha vazia
      if (line.trim() === '') {
        this.y += 3;
        continue;
      }

      // Parágrafo normal
      const runs = this.parseInline(line);
      if (runs.length) this.renderRuns(runs, 0, 9.5, 5);
    }
  }

  // ─── Seção de fontes/referências ─────────────────────────────────────────

  addSources(links: SourceLink[]) {
    if (!links.length) return;
    this.ensureSpace(18);
    this.y += 5;

    // Linha separadora
    this.dc(C.primary); this.doc.setLineWidth(0.5);
    this.doc.line(this.ML, this.y, this.PW - this.MR, this.y);
    this.y += 6;

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.tc(C.primaryDark);
    this.doc.text('FONTES E REFERÊNCIAS', this.ML, this.y);
    this.y += 6;

    links.slice(0, 25).forEach((link, i) => {
      this.ensureSpace(6);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.tc(C.muted);
      this.doc.text(`${i + 1}.`, this.ML, this.y);
      this.tc(C.primary);
      const label = link.text || link.url;
      const truncated = label.length > 95 ? label.slice(0, 92) + '…' : label;
      this.doc.text(truncated, this.ML + 6, this.y);
      this.y += 4.5;
    });
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  save(filename: string) {
    this.applyFooters();
    this.doc.save(filename);
  }
}
