import { resolveSettingsTabs } from "./settings-tabs";

const hrefs = (isCheckinV2: boolean, canManage: boolean) =>
  resolveSettingsTabs(isCheckinV2, canManage).map((tab) => tab.href);

describe("SettingsTabs por experiencia", () => {
  it("CHECKIN_V2 muestra Negocio, Suscripción y Políticas", () => {
    expect(hrefs(true, true)).toEqual([
      "/dashboard/settings",
      "/dashboard/settings/suscripcion",
      "/dashboard/settings/politicas",
    ]);
  });

  it("CHECKIN_V2 conserva las tabs en modo lectura", () => {
    expect(hrefs(true, false)).toEqual([
      "/dashboard/settings",
      "/dashboard/settings/suscripcion",
      "/dashboard/settings/politicas",
    ]);
  });

  it("LEGACY conserva todas sus tabs para managers", () => {
    expect(hrefs(false, true)).toEqual([
      "/dashboard/settings",
      "/dashboard/members",
      "/dashboard/branches",
      "/dashboard/integrations",
      "/dashboard/settings/suscripcion",
      "/dashboard/settings/politicas",
      "/dashboard/settings/cuenta",
    ]);
  });

  it("LEGACY: sin permisos de gestión ve Políticas (lectura) y Cuenta", () => {
    expect(hrefs(false, false)).toEqual([
      "/dashboard/settings/politicas",
      "/dashboard/settings/cuenta",
    ]);
  });
});
