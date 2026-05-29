import { useCallback, useState } from 'react';

interface DossierShareBarProps {
  dossierId: string;
  companyName: string;
}

export function DossierShareBar({ dossierId, companyName }: DossierShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleCopyLink = useCallback(async () => {
    const { storage } = await import('../services/storage');
    const token = await storage.shareDossier(dossierId);
    if (!token) return;

    const url = `${window.location.origin}/dossie/${token}`;
    setShareUrl(url);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [dossierId]);

  const handleShareTeams = useCallback(() => {
    if (!shareUrl) return;
    const text = encodeURIComponent(`Dossiê ${companyName}: ${shareUrl}`);
    window.open(`https://teams.microsoft.com/l/message/0/0?message=${text}`, '_blank', 'noopener');
  }, [shareUrl, companyName]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border border-green-200 dark:border-green-800 rounded-xl">
      <span className="text-sm font-medium text-green-800 dark:text-green-200 flex-1">
        Dossiê concluído
      </span>

      <button
        onClick={handleCopyLink}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        {copied ? (
          <>
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Copiado
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Copiar link
          </>
        )}
      </button>

      <button
        onClick={handleShareTeams}
        disabled={!shareUrl}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed"
        style={{ backgroundColor: shareUrl ? '#6264A7' : '#9CA3AF' }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.43 6.2c0-.57-.43-1-.97-1H4.97c-.54 0-.97.43-.97 1v5.17c0 .58.43 1 .97 1h2.27v3.06c0 .58.43 1 .97 1h3.25c.54 0 .97-.42.97-1V6.2zM8.97 11.37H5.93V8.13h3.04v3.24z" />
          <path d="M20.03 6.2c0-.57-.43-1-.97-1h-3.55c-.54 0-.97.43-.97 1v5.31l5.49 3.4V6.2z" />
          <path d="M14.54 12.84v2.69c0 .57.43 1 .97 1h2.59c.54 0 .97-.43.97-1v-7.72l-4.53 2.8v2.23z" />
        </svg>
        Teams
      </button>
    </div>
  );
}
