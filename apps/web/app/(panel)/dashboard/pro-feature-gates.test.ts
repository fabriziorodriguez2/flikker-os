import { readFileSync } from "fs";
import { join } from "path";

const dashboardDir = __dirname;
const panelDir = join(dashboardDir, "..");
const componentsDir = join(panelDir, "..", "..", "components", "panel");

describe("gates Pro del panel", () => {
  const sidebar = readFileSync(join(panelDir, "sidebar.tsx"), "utf8");
  const mobileNav = readFileSync(join(panelDir, "mobile-nav.tsx"), "utf8");
  const layout = readFileSync(join(panelDir, "layout.tsx"), "utf8");
  const insights = readFileSync(
    join(dashboardDir, "insights", "insights-v2-page.tsx"),
    "utf8",
  );
  const notifications = readFileSync(
    join(dashboardDir, "notificaciones", "page.tsx"),
    "utf8",
  );
  const history = readFileSync(
    join(dashboardDir, "notificaciones", "history-tab.tsx"),
    "utf8",
  );
  const lockedState = readFileSync(
    join(componentsDir, "pro-feature-locked.tsx"),
    "utf8",
  );

  it("mantiene Insights visible pero reemplaza el link FREE por un botón accesible", () => {
    expect(sidebar).toContain('proFeature: "insights"');
    expect(sidebar).toContain("feature: item.proFeature!");
    expect(sidebar).toContain('source: "sidebar"');
    expect(sidebar).toContain("disponible en Flikker Pro");
    expect(mobileNav).toContain('source: "mobile_nav"');
    expect(mobileNav).toContain("disponible en Flikker Pro");
    expect(layout.indexOf("<UpgradeModalProvider>")).toBeLessThan(
      layout.indexOf("<Sidebar"),
    );
  });

  it("resuelve el plan antes de pedir analytics y corta la ruta directa FREE", () => {
    const subscription = insights.indexOf('"/businesses/current/subscription"');
    const blockedReturn = insights.indexOf("if (!isPro)");
    const analytics = insights.indexOf('"/insights/overview"');

    expect(subscription).toBeGreaterThan(-1);
    expect(blockedReturn).toBeGreaterThan(subscription);
    expect(analytics).toBeGreaterThan(blockedReturn);
    expect(insights).toContain('feature="insights"');
  });

  it("mantiene el fail-open de plan para no venderle por error a un Pro", () => {
    expect(insights).toMatch(
      /let isPro = true;[\s\S]*catch \{[\s\S]*Ante la duda, no vender/,
    );
  });

  it("bloquea el click y el deep link del historial antes de montar su fetch", () => {
    expect(notifications).toContain('feature: "notification_history"');
    expect(notifications).toContain('source: "notifications"');
    expect(notifications).toMatch(
      /isHistoryLocked[\s\S]*openUpgradeModal[\s\S]*return;[\s\S]*setTab/,
    );
    expect(notifications).toMatch(
      /!isSubscriptionLoading && isPro \?[\s\S]*<HistoryTab/,
    );
    expect(history).toContain('fetch("/api/proxy/notifications/history")');
  });

  it("usa el modal compartido desde el estado bloqueado", () => {
    expect(lockedState).toContain("useUpgradeModal()");
    expect(lockedState).toContain("openUpgradeModal({ feature, source })");
    expect(lockedState).toContain("Mejorar a Pro");
    expect(lockedState).toContain("<ProBadge />");
  });
});
