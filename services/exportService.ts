import { BACKEND_URL } from './apiConfig';
import { downloadFile } from '../utils/downloadHelpers';
import { cleanTitle } from '../utils/textCleaners';
import { fixFakeLinksHTML } from '../utils/linkFixer';
import { extractCompanyName } from '../utils/companyNameExtractor';
import { convertMarkdownToHTML, simpleMarkdownToHtml } from '../utils/markdownToHtml';
import { sanitizeSensitivePersonalData } from '../utils/privacy';
import { scoutDiag } from '../utils/diagnosticLog';
import {
  collectFullReport,
  collectFullReportAuditableSources,
  detectInconsistencies,
  generateExecutiveSummary,
  normalizeMermaidBlocks,
} from '../utils/reportUtils';
import { buildPrintReportHtml, openPrintReportWindow } from '../utils/printExport';
import { type ChatSession, type ExportFormat, type Message, type ReportType } from '../types';

interface ExportConversationFile {
  filename: string;
  content: string;
  mimeType: string;
}

export interface SendDossierEmailArgs {
  emailTo: string;
  subject: string;
  messages: Message[];
  sessionTitle?: string;
  operatorName: string;
  endpoint?: string;
  fetcher?: typeof fetch;
}

export function buildEmailSubject(sessionTitle?: string): string {
  return `Dossiê de Inteligência — ${cleanTitle(extractCompanyName(sessionTitle))} — 🦅 Senior Scout 360`;
}

export function buildExportConversationFile(
  session: ChatSession,
  format: ExportFormat,
  reportType: ReportType,
): ExportConversationFile {
  const { text: fullText, sections } = collectFullReport(session.messages);
  const inconsistenciesSection = detectInconsistencies(sections);
  const normalizedText = normalizeMermaidBlocks(fullText);
  const executiveSummary = generateExecutiveSummary(normalizedText, sections, inconsistenciesSection);
  const contentMarkdown = sanitizeSensitivePersonalData(
    reportType === 'executive'
      ? executiveSummary
      : `${executiveSummary}\n\n---\n\n${normalizedText}${inconsistenciesSection}`,
  );
  const safeTitle = cleanTitle(session.title)
    .replace(/[^a-z0-9]/gi, '_')
    .substring(0, 50);
  const dateStr = new Date().toISOString().slice(0, 10);
  const reportSuffix = reportType === 'executive' ? 'EXEC' : reportType === 'tech' ? 'FICHA' : 'DOSSIE';
  const filename = `SeniorScout_${safeTitle}_${reportSuffix}_${dateStr}`;

  if (format === 'doc') {
    return {
      filename: `${filename}.doc`,
      content: simpleMarkdownToHtml(contentMarkdown, session.title),
      mimeType: 'application/msword',
    };
  }

  if (format === 'html') {
    const { allLinks } = collectFullReport(session.messages);
    const auditableSources = collectFullReportAuditableSources(session.messages);
    const empresa = cleanTitle(extractCompanyName(session.title));
    const now = new Date();
    const metaLine = `${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} · ${sections.length} seção${sections.length !== 1 ? 'ões' : ''}`;
    return {
      filename: `${filename}.html`,
      content: buildPrintReportHtml({
        title: empresa,
        subtitle: metaLine,
        content: contentMarkdown,
        sources: allLinks.map(link => ({ title: link.title || link.url, url: link.url })),
        auditableSources,
      }),
      mimeType: 'text/html;charset=utf-8',
    };
  }

  return {
    filename: `${filename}.md`,
    content: contentMarkdown,
    mimeType: 'text/markdown;charset=utf-8',
  };
}

export function downloadConversationExport(session: ChatSession, format: ExportFormat, reportType: ReportType): void {
  const file = buildExportConversationFile(session, format, reportType);
  downloadFile(file.filename, file.content, file.mimeType);
}

export function openDossierPrintReport(messages: Message[], sessionTitle?: string): boolean {
  if (!messages || messages.length === 0) {
    throw new Error('Nenhuma mensagem para exportar.');
  }
  const { text: fullText, sections, allLinks } = collectFullReport(messages);
  const auditableSources = collectFullReportAuditableSources(messages);
  if (!fullText || fullText.length < 100) {
    throw new Error('Nenhum dossiê para exportar.');
  }

  const inconsistenciesSection = detectInconsistencies(sections);
  const normalizedFullText = normalizeMermaidBlocks(fullText);
  const executiveSummary = generateExecutiveSummary(normalizedFullText, sections, inconsistenciesSection);
  const finalText = sanitizeSensitivePersonalData(
    `${executiveSummary}\n\n---\n\n${normalizedFullText}${inconsistenciesSection}`,
  );
  const empresa = cleanTitle(extractCompanyName(sessionTitle));
  const now = new Date();
  const dataStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const metaLine = `${dataStr} às ${horaStr} · ${sections.length} seção${sections.length !== 1 ? 'ões' : ''}`;

  return openPrintReportWindow({
    title: empresa,
    subtitle: metaLine,
    content: finalText,
    sources: allLinks.map(link => ({ title: link.title || link.url, url: link.url })),
    auditableSources,
  });
}

export async function sendDossierEmail({
  emailTo,
  subject,
  messages,
  sessionTitle,
  operatorName,
  endpoint = BACKEND_URL,
  fetcher = fetch,
}: SendDossierEmailArgs): Promise<boolean> {
  if (!messages || messages.length === 0) {
    scoutDiag.warn('Export', 'sendDossierEmail: nenhuma mensagem fornecida');
    return false;
  }

  const { text: fullText, sections } = collectFullReport(messages);
  if (!fullText || fullText.length < 100) return false;

  const inconsistenciesSection = detectInconsistencies(sections);
  const htmlBody = fixFakeLinksHTML(convertMarkdownToHTML(fullText + inconsistenciesSection, true));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      signal: controller.signal,
      body: JSON.stringify({
        action: 'sendEmail',
        email: emailTo,
        subject,
        body: htmlBody,
        empresa: cleanTitle(extractCompanyName(sessionTitle)),
        vendedor: operatorName,
      }),
    });
    const text = await response.text();
    try {
      return Boolean((JSON.parse(text) as { success?: boolean }).success);
    } catch (err) {
      scoutDiag.warn('ExportService', 'Falha ao parsear resposta do email (assumindo ok)', {
        error: err instanceof Error ? err.message : String(err),
      });
      return response.ok;
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      scoutDiag.warn('Export', 'sendDossierEmail: timeout (30s)');
    } else {
      scoutDiag.warn('Export', 'sendDossierEmail falhou', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
