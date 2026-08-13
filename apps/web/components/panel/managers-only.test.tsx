import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleProvider } from "@/app/(panel)/role-context";
import ManagersOnly from "./managers-only";

/**
 * `ManagersOnly` es el guard que evita que un OPERATOR entre a una pantalla
 * cuyo backend entero (lectura incluida) es OWNER/ADMIN — como Integraciones,
 * donde ni el GET responde para otro rol. Sin este guard, el componente de
 * adentro monta, dispara sus fetch, y el OPERATOR ve una pantalla rota en vez
 * de un mensaje que explique por qué no puede estar ahí.
 */

function render(role: string | null) {
  return renderToStaticMarkup(
    <RoleProvider role={role}>
      <ManagersOnly what="las integraciones">
        <div>Contenido protegido</div>
      </ManagersOnly>
    </RoleProvider>,
  );
}

describe("ManagersOnly", () => {
  it("OWNER ve el contenido", () => {
    expect(render("OWNER")).toContain("Contenido protegido");
  });

  it("ADMIN ve el contenido", () => {
    expect(render("ADMIN")).toContain("Contenido protegido");
  });

  it("OPERATOR NO ve el contenido — ve el aviso en su lugar", () => {
    const html = render("OPERATOR");
    expect(html).not.toContain("Contenido protegido");
    expect(html).toContain("solo para el dueño o un administrador");
  });

  it("VIEWER tampoco lo ve", () => {
    const html = render("VIEWER");
    expect(html).not.toContain("Contenido protegido");
  });

  it("sin rol (sesión rota) tampoco lo ve — nunca abre por accidente", () => {
    const html = render(null);
    expect(html).not.toContain("Contenido protegido");
  });

  it("el aviso ofrece una salida a una superficie permitida, no un callejón sin salida", () => {
    const html = render("OPERATOR");
    expect(html).toContain("/dashboard/settings/cuenta");
  });
});
