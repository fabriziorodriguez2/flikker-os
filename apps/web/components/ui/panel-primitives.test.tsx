import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Badge from "./badge";
import Button from "./button";
import Card from "./card";
import FormField from "./form-field";
import { Input } from "./input";
import InlineNotice from "./inline-notice";
import Metric from "./metric";
import PageHeader from "./page-header";
import { TabButton, TabsList } from "./tabs";

describe("panel primitives — contratos compartidos", () => {
  it("Button conserva semántica, estado loading y tamaño estándar", () => {
    const html = renderToStaticMarkup(
      <Button variant="primary" loading loadingLabel="Guardando">
        Guardar
      </Button>,
    );

    expect(html).toContain("<button");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("h-9");
    expect(html).toContain("Guardando");
  });

  it("Badge comunica el tono sin cambiar su anatomía", () => {
    const html = renderToStaticMarkup(<Badge tone="success">Activo</Badge>);
    expect(html).toContain("--panel-success-bg");
    expect(html).toContain("Activo");
  });

  it("Tabs expone roles y selección accesibles", () => {
    const html = renderToStaticMarkup(
      <TabsList aria-label="Secciones">
        <TabButton active>Resumen</TabButton>
        <TabButton active={false}>Historial</TabButton>
      </TabsList>,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
  });

  it("FormField conecta label, ayuda, required e input", () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Nombre"
        htmlFor="name"
        hint="Visible para clientes"
        required
      >
        <Input id="name" />
      </FormField>,
    );

    expect(html).toContain('for="name"');
    expect(html).toContain('id="name"');
    expect(html).toContain("Visible para clientes");
  });

  it("Card y Metric forman una métrica sobria sin efectos ornamentales", () => {
    const html = renderToStaticMarkup(
      <Card>
        <Metric
          label="Clientes activos"
          value="128"
          context="Últimos 30 días"
        />
      </Card>,
    );

    expect(html).toContain("--panel-radius-card");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("Clientes activos");
  });

  it("InlineNotice usa alert para errores", () => {
    const html = renderToStaticMarkup(
      <InlineNotice tone="danger" title="No pudimos guardar">
        Reintentá en unos segundos.
      </InlineNotice>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("--panel-danger-border");
  });

  it("PageHeader consume tokens del panel", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Programa" subtitle="Configurá la experiencia." />,
    );
    expect(html).toContain("panel-page-header");
    expect(html).toContain("--panel-text");
  });
});

describe("panel primitives — límites de la Fase 1", () => {
  const primitiveFiles = [
    "badge.tsx",
    "button.tsx",
    "card.tsx",
    "form-field.tsx",
    "input.tsx",
    "inline-notice.tsx",
    "metric.tsx",
    "section-header.tsx",
    "tabs.tsx",
  ];

  it("no agrega colores hexadecimales dentro de las primitives", () => {
    for (const file of primitiveFiles) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source).not.toMatch(/#[\da-f]{3,8}/i);
    }
  });

  it("los tokens y Geist están scopeados al wrapper CHECKIN_V2", () => {
    const css = readFileSync(
      join(__dirname, "..", "..", "app", "globals.css"),
      "utf8",
    );
    const layout = readFileSync(
      join(__dirname, "..", "..", "app", "(panel)", "layout.tsx"),
      "utf8",
    );

    expect(css).toContain(".flikker-panel-v2");
    expect(css).toContain("--panel-canvas");
    expect(css).not.toContain("--pub-panel");
    expect(layout).toContain("isCheckinV2 ?");
    expect(layout).toContain("flikker-panel-v2");
  });
});
