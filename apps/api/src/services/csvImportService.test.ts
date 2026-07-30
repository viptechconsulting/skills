import { afterAll, afterEach, describe, expect, it } from "vitest";
import "../testSetup.js";
import { prisma } from "@lynkro-outbound/db";
import { resetDatabase, seedOrgWithCampaign } from "../testHelpers.js";
import { importProspectsFromCsv } from "./csvImportService.js";

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const CSV_HEADER =
  "name,phone,company,email,language,timezone,context,intent,desiredOutcome,source,consentGiven,tags";
const CSV_HEADER_WITH_CAMPAIGN = `${CSV_HEADER},campaignId`;

describe("importProspectsFromCsv", () => {
  it("crea prospectos normalizando el teléfono a E.164", async () => {
    const org = await seedOrgWithCampaign("Csv1");
    const csv = `${CSV_HEADER}\nJuan Pérez,+1 415 555 0100,Acme,juan@acme.test,es,America/Bogota,Contexto,Intención,Resultado,formulario,true,demo|vip`;

    const result = await importProspectsFromCsv(org.organization.id, csv);

    expect(result.created).toBe(1);
    expect(result.rejected).toBe(0);

    const prospect = await prisma.prospect.findFirstOrThrow({ where: { organizationId: org.organization.id } });
    expect(prospect.phoneE164).toBe("+14155550100");
    expect(prospect.tags).toEqual(["demo", "vip"]);
  });

  it("detecta duplicados por teléfono + organización y actualiza en vez de crear", async () => {
    const org = await seedOrgWithCampaign("Csv2");
    const csv = `${CSV_HEADER}\nJuan Pérez,+14155550101,Acme,juan@acme.test,es,America/Bogota,Contexto,Intención,Resultado,formulario,true,`;

    await importProspectsFromCsv(org.organization.id, csv);
    const secondCsv = `${CSV_HEADER}\nJuan P. Actualizado,+14155550101,Acme,juan@acme.test,es,America/Bogota,Contexto nuevo,Intención,Resultado,formulario,true,`;
    const result = await importProspectsFromCsv(org.organization.id, secondCsv);

    expect(result.created).toBe(0);
    expect(result.updatedDuplicates).toBe(1);

    const prospects = await prisma.prospect.findMany({ where: { organizationId: org.organization.id } });
    expect(prospects).toHaveLength(1);
    expect(prospects[0]?.name).toBe("Juan P. Actualizado");
  });

  it("rechaza filas con teléfono inválido sin abortar el resto de la importación", async () => {
    const org = await seedOrgWithCampaign("Csv3");
    const csv = `${CSV_HEADER}\nVálido,+14155550102,Acme,,es,America/Bogota,,Intención,Resultado,formulario,true,\nInválido,123,Acme,,es,America/Bogota,,Intención,Resultado,formulario,true,`;

    const result = await importProspectsFromCsv(org.organization.id, csv);

    expect(result.created).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("rechaza una fila con campaignId inexistente sin abortar el resto ni tirar 500", async () => {
    const org = await seedOrgWithCampaign("Csv5");
    const csv = `${CSV_HEADER_WITH_CAMPAIGN}\nCon campaña válida,+14155550103,Acme,,es,America/Bogota,,Intención,Resultado,formulario,true,,${org.campaign.id}\nCon campaña inexistente,+14155550104,Acme,,es,America/Bogota,,Intención,Resultado,formulario,true,,00000000-0000-0000-0000-000000000099`;

    const result = await importProspectsFromCsv(org.organization.id, csv);

    expect(result.created).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.errors[0]?.message).toContain("no existe en esta organización");

    const prospect = await prisma.prospect.findFirstOrThrow({ where: { organizationId: org.organization.id } });
    expect(prospect.campaignId).toBe(org.campaign.id);
  });

  it("permite el mismo teléfono en organizaciones distintas", async () => {
    const orgA = await seedOrgWithCampaign("Csv4A");
    const orgB = await seedOrgWithCampaign("Csv4B");
    const csv = `${CSV_HEADER}\nPersona,+14155550199,Acme,,es,America/Bogota,,Intención,Resultado,formulario,true,`;

    const resultA = await importProspectsFromCsv(orgA.organization.id, csv);
    const resultB = await importProspectsFromCsv(orgB.organization.id, csv);

    expect(resultA.created).toBe(1);
    expect(resultB.created).toBe(1);
  });
});
