import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards de la navegación de Mi Flikker.
 *
 * Son de texto fuente porque lo que hay que impedir no es un comportamiento
 * de runtime sino que vuelva a existir DOS sistemas de navegación a la vez
 * (la barra de abajo + los tabs de arriba que había antes), y que el
 * endpoint de premios se consuma sin pasar por la sesión de la cuenta.
 */
const HERE = __dirname;
const WEB = join(HERE, "..", "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const CLIENT = "app/(public)/mi-flikker/mi-flikker-client.tsx";
const DETALLE = "app/(public)/mi-flikker/[businessId]/place-detail-client.tsx";
const ROUTE = "app/api/mi-flikker/rewards/route.ts";

describe("Mi Flikker — una sola navegación", () => {
  it("la barra de abajo es la navegación canónica", () => {
    const source = read(CLIENT);
    expect(source).toContain('from "@/components/public/bottom-nav"');
  });

  it("ya no existen los tabs superiores Lugares/Desafíos", () => {
    const source = read(CLIENT);
    // El segmented control viejo se dibujaba con `role="tablist"`.
    expect(source).not.toContain('role="tablist"');
    expect(source).not.toContain('role="tab"');
  });

  it("tampoco quedó el menú de cuenta del header — Cuenta es una pestaña", () => {
    expect(read(CLIENT)).not.toContain("AccountMenu");
  });

  it("la barra también vive en el detalle de un lugar", () => {
    const source = read(DETALLE);
    expect(source).toContain('from "@/components/public/bottom-nav"');
    expect(source).toContain('<BottomNav active="lugares"');
  });

  /*
    La barra es `fixed` abajo: sin un padding que reserve su alto, la última
    fila de cualquier lista queda tapada por ella.
  */
  it("las dos pantallas reservan el alto de la barra", () => {
    expect(read(CLIENT)).toContain("pb-24");
    expect(read(DETALLE)).toContain("pb-24");
  });
});

describe("Premios — el scope lo decide la sesión, nunca el cliente", () => {
  const source = read(ROUTE);

  it("sin cookie de cuenta responde 401 y no llama al API", () => {
    expect(source).toContain("getFlikkerAccountToken");
    expect(source).toMatch(/if \(!session\)[\s\S]*status: 401/);
  });

  it("manda la sesión como header y NUNCA un customerId/businessId del cliente", () => {
    expect(source).toContain('"x-flikker-account-session": session');
    expect(source).not.toContain("customerId");
    expect(source).not.toContain("searchParams");
  });
});
