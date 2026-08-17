import { resolveNavSections } from "./sidebar";

/**
 * La navegación es el contrato de producto más visible que tiene Flikker: es
 * lo primero que ve el dueño y define qué cree que es la herramienta.
 *
 * Estos tests fijan dos cosas que se rompen con facilidad al agregar
 * pantallas: que Check-in V2 muestre EXACTAMENTE las secciones acordadas y
 * nada más, y que LEGACY no pierda nada de lo que usa todos los días.
 */

const hrefsOf = (sections: ReturnType<typeof resolveNavSections>) =>
  sections.flatMap((section) => section.items.map((item) => item.href));

const owner = (overrides: Partial<Parameters<typeof resolveNavSections>[0]> = {}) =>
  resolveNavSections({
    isCheckinV2: true,
    isImpersonating: false,
    role: "OWNER",
    isPlatformAdmin: false,
    ...overrides,
  });

describe("Navegación CHECKIN_V2", () => {
  it("muestra exactamente las siete superficies del producto", () => {
    expect(hrefsOf(owner())).toEqual([
      "/dashboard",
      "/dashboard/programa",
      "/dashboard/customers",
      "/dashboard/notificaciones",
      "/dashboard/reviews",
      "/dashboard/qr",
      "/dashboard/settings",
    ]);
  });

  it("agrupa por lo que el dueño quiere hacer, no por cómo está construido", () => {
    expect(owner().map((s) => s.title)).toEqual([
      null,
      "Fidelización",
      "Comunicación",
      "Reseñas",
      "Negocio",
    ]);
  });

  /**
   * Las rutas absorbidas siguen existiendo — lo que no existe es el camino
   * para llegar a ellas por navegación.
   */
  it.each([
    ["/dashboard/retention-v2", "Retention V2"],
    ["/dashboard/retention", "Retención"],
    ["/dashboard/benefits", "Beneficios"],
    ["/dashboard/campaigns", "Campañas"],
    ["/dashboard/checkins", "Check-ins"],
    ["/dashboard/insights", "Insights"],
    ["/dashboard/widgets", "Widget"],
    ["/dashboard/members", "Equipo"],
    ["/dashboard/branches", "Sucursales"],
    ["/dashboard/integrations", "Integraciones"],
  ])("un OWNER no ve %s (%s) en el sidebar", (href) => {
    expect(hrefsOf(owner())).not.toContain(href);
  });

  it("la palabra Retention nunca aparece como etiqueta", () => {
    const labels = owner().flatMap((s) => s.items.map((i) => i.label));
    expect(labels.join(" ")).not.toMatch(/retention/i);
    expect(labels).toContain("Notificaciones");
  });

  it("Beneficios no tiene entrada propia: se administran desde Programa", () => {
    const labels = owner().flatMap((s) => s.items.map((i) => i.label));
    expect(labels).not.toContain("Beneficios");
    expect(labels).toContain("Programa");
  });
});

describe("Navegación real — regresión del bug de acceso a Programa", () => {
  /**
   * El bug reportado ("no puedo acceder a Programa") era esto exactamente:
   * `(panel)/layout.tsx` nunca pasaba `role` a `<Sidebar>` — `resolveNavSections`
   * recibía `role: null`, y CUALQUIER ítem con `roles` (hoy solo Programa)
   * desaparecía para TODOS, incluido el propio OWNER. Este test documenta el
   * síntoma para que, si alguien vuelve a olvidar pasar `role`, un test lo
   * atrape en vez de un reporte de un dueño real.
   */
  it("sin rol (prop no pasado) Programa desaparece incluso para un negocio CHECKIN_V2 activo", () => {
    const sinRol = resolveNavSections({
      isCheckinV2: true,
      isImpersonating: false,
      role: null,
      isPlatformAdmin: false,
    });
    expect(hrefsOf(sinRol)).not.toContain("/dashboard/programa");
  });

  it.each(["OWNER", "ADMIN"])(
    "con rol %s, Programa SÍ está disponible",
    (role) => {
      const sections = resolveNavSections({
        isCheckinV2: true,
        isImpersonating: false,
        role,
        isPlatformAdmin: false,
      });
      expect(hrefsOf(sections)).toContain("/dashboard/programa");
    },
  );

  it("OPERATOR no ve Programa (política actual: solo OWNER/ADMIN administran)", () => {
    const sections = resolveNavSections({
      isCheckinV2: true,
      isImpersonating: false,
      role: "OPERATOR",
      isPlatformAdmin: false,
    });
    expect(hrefsOf(sections)).not.toContain("/dashboard/programa");
  });
});

describe("Navegación por rol", () => {
  /**
   * Programa configura sellos, recompensa y beneficios: el backend ya rechaza
   * a OPERATOR, así que mostrárselo sería ofrecerle un 403.
   */
  it("OPERATOR no ve Programa, pero sí lo que puede usar", () => {
    const hrefs = hrefsOf(owner({ role: "OPERATOR" }));

    expect(hrefs).not.toContain("/dashboard/programa");
    expect(hrefs).toEqual([
      "/dashboard",
      "/dashboard/customers",
      "/dashboard/notificaciones",
      "/dashboard/reviews",
      "/dashboard/qr",
      "/dashboard/settings",
    ]);
  });

  it("ADMIN ve lo mismo que OWNER", () => {
    expect(hrefsOf(owner({ role: "ADMIN" }))).toEqual(hrefsOf(owner()));
  });

  it("una sección que se queda sin ítems no deja un encabezado huérfano", () => {
    const sections = owner({ role: "OPERATOR" });
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });
});

describe("Navegación LEGACY", () => {
  const legacy = () =>
    resolveNavSections({
      isCheckinV2: false,
      isImpersonating: false,
      role: "OWNER",
      isPlatformAdmin: false,
    });

  /**
   * Para estos negocios, Campañas, Beneficios y Retención V1 SON el producto.
   * La limpieza es para Check-in V2; acá sacarlas rompería el panel de gente
   * que ya lo usa.
   */
  it.each([
    "/dashboard/campaigns",
    "/dashboard/benefits",
    "/dashboard/retention",
    "/dashboard/insights",
    "/dashboard/customers",
    "/dashboard/reviews",
  ])("conserva %s", (href) => {
    expect(hrefsOf(legacy())).toContain(href);
  });

  it("no muestra superficies que en LEGACY no existen", () => {
    const hrefs = hrefsOf(legacy());
    expect(hrefs).not.toContain("/dashboard/programa");
    expect(hrefs).not.toContain("/dashboard/notificaciones");
    expect(hrefs).not.toContain("/dashboard/checkins");
  });

  /**
   * Sacados a pedido explícito: no aportan a la operación diaria de un
   * negocio LEGACY. Las rutas siguen funcionando por URL directa — esto
   * prueba solo que dejaron de tener una entrada visible en el sidebar para
   * el dueño normal.
   */
  it.each(["/dashboard/qr", "/dashboard/settings"])(
    "ya NO muestra %s para el dueño normal",
    (href) => {
      expect(hrefsOf(legacy())).not.toContain(href);
    },
  );

  /**
   * QR es la excepción: el dueño LEGACY no lo necesita en el nav, pero un
   * operador de Flikker impersonando ese negocio sí — soporte y demos con el
   * estudio de impresión. Mismo mecanismo que ya usa "Widget".
   */
  it("un operador de Flikker impersonando SÍ ve QR", () => {
    const impersonatingLegacy = resolveNavSections({
      isCheckinV2: false,
      isImpersonating: true,
      role: "OWNER",
      isPlatformAdmin: true,
    });

    expect(hrefsOf(impersonatingLegacy)).toContain("/dashboard/qr");
  });

  it("Configuración sigue oculta incluso impersonando", () => {
    const impersonatingLegacy = resolveNavSections({
      isCheckinV2: false,
      isImpersonating: true,
      role: "OWNER",
      isPlatformAdmin: true,
    });

    expect(hrefsOf(impersonatingLegacy)).not.toContain("/dashboard/settings");
  });

  it("LEGACY intacto: Platform Admin impersonando también recupera Herramientas Flikker", () => {
    const impersonatingLegacy = resolveNavSections({
      isCheckinV2: false,
      isImpersonating: true,
      role: "OWNER",
      isPlatformAdmin: true,
    });

    expect(impersonatingLegacy.map((s) => s.title)).toContain("Herramientas Flikker");
    // Y el resto del nav LEGACY (Campañas, Beneficios, Retención...) sigue igual.
    expect(hrefsOf(impersonatingLegacy)).toEqual(
      expect.arrayContaining([
        "/dashboard/campaigns",
        "/dashboard/benefits",
        "/dashboard/retention",
      ]),
    );
  });
});

describe("Platform Admin / impersonation", () => {
  /**
   * La sección se gobierna con `isPlatformAdmin` — el dato del usuario que
   * inició sesión — nunca con el rol de negocio ni, por sí solo, con
   * `isImpersonating`. Ver el comentario sobre `OPERATOR_TOOLS` en sidebar.tsx.
   */
  const platformAdminImpersonating = () =>
    resolveNavSections({
      isCheckinV2: true,
      isImpersonating: true,
      role: "OWNER",
      isPlatformAdmin: true,
    });

  /**
   * Separar la UI de producto de las herramientas internas es el punto: el
   * dueño no las ve, y nosotros no perdemos acceso a ninguna.
   */
  it("Platform Admin impersonando recupera las herramientas técnicas en una sección aparte", () => {
    const hrefs = hrefsOf(platformAdminImpersonating());

    expect(hrefs).toContain("/dashboard/retention-v2");
    expect(hrefs).toContain("/dashboard/checkins");
    expect(hrefs).toContain("/dashboard/insights");
    expect(hrefs).toContain("/dashboard/benefits");
    expect(hrefs).toContain("/dashboard/widgets");
  });

  it("las agrupa bajo un encabezado que aclara que son internas", () => {
    const titles = platformAdminImpersonating().map((s) => s.title);
    expect(titles).toContain("Herramientas Flikker");
  });

  it("Platform Admin impersonando ve navegación normal + Herramientas Flikker", () => {
    const productHrefs = hrefsOf(platformAdminImpersonating()).slice(0, 7);
    expect(productHrefs).toEqual(hrefsOf(owner()));
  });

  it("sin isPlatformAdmin esa sección no existe (OWNER normal)", () => {
    expect(owner().map((s) => s.title)).not.toContain("Herramientas Flikker");
  });

  it("ADMIN: rol de negocio no es Platform Admin, no ve Herramientas Flikker", () => {
    const sections = owner({ role: "ADMIN", isPlatformAdmin: false });
    expect(sections.map((s) => s.title)).not.toContain("Herramientas Flikker");
  });

  it("OPERATOR: tampoco ve Herramientas Flikker", () => {
    const sections = owner({ role: "OPERATOR", isPlatformAdmin: false });
    expect(sections.map((s) => s.title)).not.toContain("Herramientas Flikker");
  });

  /**
   * El caso que motivó el fix: `isImpersonating` por sí solo NO debe alcanzar
   * para mostrar la sección. Hoy en la práctica solo un Platform Admin puede
   * llegar a impersonar (el layout lo garantiza en otra pantalla), pero esta
   * función no debe depender de esa garantía externa para tomar una decisión
   * de seguridad — tiene que verificar el dato explícito.
   */
  it("isImpersonating solo, sin isPlatformAdmin, NO alcanza para ver Herramientas Flikker", () => {
    const sections = resolveNavSections({
      isCheckinV2: true,
      isImpersonating: true,
      role: "OWNER",
      isPlatformAdmin: false,
    });
    expect(sections.map((s) => s.title)).not.toContain("Herramientas Flikker");
  });

  /**
   * Y el espejo: siendo Platform Admin, la sección debe aparecer aunque por
   * algún motivo `isImpersonating` no estuviera seteado (la función no debe
   * exigir AMBAS condiciones a la vez, solo `isPlatformAdmin`).
   */
  it("isPlatformAdmin solo alcanza, sin necesitar isImpersonating explícito", () => {
    const sections = resolveNavSections({
      isCheckinV2: true,
      isImpersonating: false,
      role: "OWNER",
      isPlatformAdmin: true,
    });
    expect(sections.map((s) => s.title)).toContain("Herramientas Flikker");
  });
});
