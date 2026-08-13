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
    "/dashboard/qr",
  ])("conserva %s", (href) => {
    expect(hrefsOf(legacy())).toContain(href);
  });

  it("no muestra superficies que en LEGACY no existen", () => {
    const hrefs = hrefsOf(legacy());
    expect(hrefs).not.toContain("/dashboard/programa");
    expect(hrefs).not.toContain("/dashboard/notificaciones");
    expect(hrefs).not.toContain("/dashboard/checkins");
  });

  it("también llega a Configuración", () => {
    expect(hrefsOf(legacy())).toContain("/dashboard/settings");
  });
});

describe("Platform Admin / impersonation", () => {
  const impersonating = () =>
    resolveNavSections({
      isCheckinV2: true,
      isImpersonating: true,
      role: "OWNER",
    });

  /**
   * Separar la UI de producto de las herramientas internas es el punto: el
   * dueño no las ve, y nosotros no perdemos acceso a ninguna.
   */
  it("recupera las herramientas técnicas en una sección aparte", () => {
    const hrefs = hrefsOf(impersonating());

    expect(hrefs).toContain("/dashboard/retention-v2");
    expect(hrefs).toContain("/dashboard/checkins");
    expect(hrefs).toContain("/dashboard/insights");
    expect(hrefs).toContain("/dashboard/benefits");
    expect(hrefs).toContain("/dashboard/widgets");
  });

  it("las agrupa bajo un encabezado que aclara que son internas", () => {
    const titles = impersonating().map((s) => s.title);
    expect(titles).toContain("Herramientas Flikker");
  });

  it("sin impersonation esa sección no existe", () => {
    expect(owner().map((s) => s.title)).not.toContain("Herramientas Flikker");
  });

  it("las secciones de producto siguen intactas mientras se impersona", () => {
    const productHrefs = hrefsOf(impersonating()).slice(0, 7);
    expect(productHrefs).toEqual(hrefsOf(owner()));
  });
});
