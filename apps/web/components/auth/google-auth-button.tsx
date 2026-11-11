/**
 * Botón "Continuar con Google" — estándar de Google: fondo blanco, borde
 * neutro y la "G" oficial sin modificar. Es un `<a>` y no un `<Link>`: el
 * destino es un route handler que redirige a Google, así que tiene que ser
 * una navegación completa (y sin prefetch).
 */
export function GoogleAuthButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="flex h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-[#DEDCE8] bg-white px-4 text-sm font-semibold text-[#28243A] hover:border-[#C9C6D6] hover:bg-[#F8F8FA] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#28243A]/10"
    >
      <GoogleGIcon />
      <span>Continuar con Google</span>
    </a>
  );
}

export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-[#E8E6F0]" />
      <span className="text-xs font-medium text-[#9B97AA]">o</span>
      <span className="h-px flex-1 bg-[#E8E6F0]" />
    </div>
  );
}

/** "G" oficial de Google (4 colores), tal cual la publica Google. */
function GoogleGIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 48 48"
      className="shrink-0"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
