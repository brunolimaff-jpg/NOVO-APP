import { SUPPORT_CONTACT_URL, SUPPORT_CONTACT_LABEL } from '../constants/support';

const currentYear = new Date().getFullYear();

export default function FooterCredits() {
  return (
    <footer className="border-t border-gray-200/70 bg-white py-2 dark:border-gray-800/70 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-7xl px-4 text-center text-[10px] leading-5 text-gray-400 sm:px-6 sm:text-[11px] md:text-right lg:px-8 dark:text-gray-500">
        <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 md:justify-end">
          <span>Ajuda e Suporte:</span>
          <a
            href={SUPPORT_CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-gray-500 transition-colors hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
          >
            bruno.ferreira
          </a>
          <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">
            ·
          </span>
          <span>Senior Scout 360 © {currentYear}</span>
        </p>
      </div>
    </footer>
  );
}
