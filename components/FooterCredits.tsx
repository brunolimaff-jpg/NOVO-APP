const currentYear = new Date().getFullYear();

export default function FooterCredits() {
  return (
    <footer className="border-t border-gray-200 bg-white py-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 text-center text-xs text-gray-500 sm:px-6 md:text-right lg:px-8 dark:text-gray-400">
        <p>
          Desenvolvido e idealizado por{' '}
          <a
            href="https://www.linkedin.com/in/brunolimafreitas/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 transition-colors hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
          >
            bruno.ferreira
          </a>
        </p>
        <p>Senior Scout 360 © {currentYear}</p>
      </div>
    </footer>
  );
}
