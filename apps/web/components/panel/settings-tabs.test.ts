import { resolveSettingsTabs } from "./settings-tabs";

const hrefs = (isCheckinV2: boolean, canManage: boolean) =>
  resolveSettingsTabs(isCheckinV2, canManage).map((tab) => tab.href);

describe("SettingsTabs por experiencia", () => {
  it("CHECKIN_V2 muestra únicamente Negocio y Suscripción", () => {
    expect(hrefs(true, true)).toEqual([
      "/dashboard/settings",
      "/dashboard/settings/suscripcion",
    ]);
  });

  it("CHECKIN_V2 conserva ambas tabs en modo lectura", () => {
    expect(hrefs(true, false)).toEqual([
      "/dashboard/settings",
      "/dashboard/settings/suscripcion",
    ]);
  });

  it("LEGACY conserva todas sus tabs para managers", () => {
    expect(hrefs(false, true)).toEqual([
      "/dashboard/settings",
      "/dashboard/members",
      "/dashboard/branches",
      "/dashboard/integrations",
      "/dashboard/settings/suscripcion",
      "/dashboard/settings/cuenta",
    ]);
  });

  it("LEGACY conserva solo Cuenta para roles sin permisos", () => {
    expect(hrefs(false, false)).toEqual(["/dashboard/settings/cuenta"]);
  });
});
