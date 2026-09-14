import type { ReactNode } from "react";
import Image from "next/image";

export function AuthSplitShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-[100svh] w-full overflow-x-hidden bg-white md:h-[100svh] md:grid-cols-[minmax(280px,40%)_minmax(0,60%)] md:overflow-hidden xl:grid-cols-[45%_55%]">
      <aside className="relative hidden h-[100svh] overflow-hidden bg-[#25106F] text-white md:block">
        <Image
          src="/auth-cafe.png"
          alt="Una clienta disfrutando un café en un negocio local"
          fill
          priority
          sizes="(min-width: 1280px) 45vw, (min-width: 768px) 40vw, 0vw"
          className="object-cover object-[43%_center] lg:object-[42%_center]"
        />

        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(155deg,rgba(151,224,255,0.58)_0%,rgba(91,67,232,0.52)_35%,rgba(37,16,111,0.48)_66%,rgba(20,7,62,0.72)_100%)] mix-blend-multiply"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(38,24,123,0.38)_0%,transparent_38%,rgba(15,7,45,0.18)_58%,rgba(15,7,45,0.88)_100%)]"
        />

        <div className="relative flex h-full flex-col justify-between px-8 py-8 lg:px-10 lg:py-10 xl:px-12 xl:py-11">
          <div className="flex items-center gap-3">
            <Image
              src="/flikker-mark-white.svg"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <Image
              src="/flikker-wordmark-white.svg"
              alt="Flikker"
              width={104}
              height={24}
              className="h-5 w-auto"
            />
          </div>

          <div className="max-w-[470px] pb-2 text-white [text-shadow:0_1px_24px_rgba(9,3,31,0.28)] lg:pb-4">
            <p className="mb-3 text-sm font-semibold tracking-[-0.01em] text-white/80">
              Todo tu negocio, más claro
            </p>
            <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.045em] lg:text-[40px] xl:text-[44px]">
              Convertí cada visita en una relación que vuelve.
            </h1>
            <p className="mt-5 max-w-[410px] text-[15px] leading-6 text-white/78 lg:text-base lg:leading-7">
              Reputación, clientes y campañas en un solo lugar, para que puedas
              enfocarte en hacer crecer tu negocio.
            </p>
          </div>
        </div>
      </aside>

      <section className="flex min-h-[100svh] min-w-0 items-center overflow-y-auto bg-white px-5 py-8 sm:px-8 md:h-[100svh] md:px-10 md:py-10 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-[460px]">
          <div className="mb-10 md:hidden">
            <Image
              src="/flikker-logotype.svg"
              alt="Flikker"
              width={96}
              height={31}
              priority
              className="h-auto w-[88px]"
            />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
