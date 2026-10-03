import {
  buildNotificationWhatsAppRequestBody,
  parseNotificationWhatsAppError,
  NOTIFICATION_WHATSAPP_GENERIC_ERROR,
} from "./notification-whatsapp";

describe("buildNotificationWhatsAppRequestBody", () => {
  it("antepone +598 a los dígitos nacionales", () => {
    expect(buildNotificationWhatsAppRequestBody("99123456")).toEqual({
      phone: "+59899123456",
    });
  });

  it("el body es exactamente { phone } — nada más", () => {
    expect(Object.keys(buildNotificationWhatsAppRequestBody("99123456"))).toEqual([
      "phone",
    ]);
  });
});

describe("parseNotificationWhatsAppError", () => {
  it("usa el message del backend si vino", () => {
    expect(
      parseNotificationWhatsAppError({ message: "Phone must have between 8 and 15 digits" }),
    ).toBe("Phone must have between 8 and 15 digits");
  });

  it("sin message (caída de red, body vacío): mensaje genérico", () => {
    expect(parseNotificationWhatsAppError(null)).toBe(
      NOTIFICATION_WHATSAPP_GENERIC_ERROR,
    );
    expect(parseNotificationWhatsAppError({})).toBe(
      NOTIFICATION_WHATSAPP_GENERIC_ERROR,
    );
  });
});
