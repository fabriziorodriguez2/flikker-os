/**
 * Marco de celular puramente presentacional para previews del panel
 * (Programa → Tarjeta digital / Página de inscripción). Sin Apple/Google
 * Wallet — es solo el bezel, el contenido real (LoyaltyCard, Shell) llena
 * la pantalla. `aspect-[9/19.5]` es la relación de un teléfono moderno, así
 * el alto se deriva del ancho sin necesitar una altura fija hardcodeada.
 */
export default function PhoneFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative mx-auto w-full max-w-[300px] ${className ?? ""}`}>
      <div className="relative rounded-[38px] border-[6px] border-[#14151C] bg-[#14151C] shadow-[0_24px_48px_rgba(12,16,30,0.25)]">
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-[14px] bg-[#14151C]"
        />
        <div className="relative aspect-[9/19.5] overflow-y-auto overscroll-contain rounded-[32px] bg-white">
          {children}
        </div>
      </div>
    </div>
  );
}
