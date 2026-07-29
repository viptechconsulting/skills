import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetTestDatabase, seedOrganizationFixture } from "../testUtils.js";
import {
  findProspectByIdScoped,
  findProspectsByOrganization,
  updateProspectScoped,
} from "./prospects.js";

const db = createTestPrismaClient();

beforeEach(async () => {
  await resetTestDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("aislamiento multi-organización de prospectos", () => {
  it("una organización nunca ve prospectos de otra", async () => {
    const orgA = await seedOrganizationFixture(db, "A");
    const orgB = await seedOrganizationFixture(db, "B");

    await db.prospect.create({
      data: {
        organizationId: orgA.organizationId,
        campaignId: orgA.campaignId,
        name: "Prospecto A",
        phoneE164: "+14155550001",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });
    await db.prospect.create({
      data: {
        organizationId: orgB.organizationId,
        campaignId: orgB.campaignId,
        name: "Prospecto B",
        phoneE164: "+14155550002",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });

    const prospectsOrgA = await findProspectsByOrganization(db, orgA.organizationId);
    const prospectsOrgB = await findProspectsByOrganization(db, orgB.organizationId);

    expect(prospectsOrgA).toHaveLength(1);
    expect(prospectsOrgA[0]?.name).toBe("Prospecto A");
    expect(prospectsOrgB).toHaveLength(1);
    expect(prospectsOrgB[0]?.name).toBe("Prospecto B");
  });

  it("findProspectByIdScoped no devuelve un prospecto de otra organización", async () => {
    const orgA = await seedOrganizationFixture(db, "A");
    const orgB = await seedOrganizationFixture(db, "B");

    const prospect = await db.prospect.create({
      data: {
        organizationId: orgA.organizationId,
        campaignId: orgA.campaignId,
        name: "Solo de A",
        phoneE164: "+14155550003",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });

    const foundFromOwnOrg = await findProspectByIdScoped(db, orgA.organizationId, prospect.id);
    const foundFromOtherOrg = await findProspectByIdScoped(db, orgB.organizationId, prospect.id);

    expect(foundFromOwnOrg?.id).toBe(prospect.id);
    expect(foundFromOtherOrg).toBeNull();
  });

  it("updateProspectScoped no puede modificar un prospecto de otra organización", async () => {
    const orgA = await seedOrganizationFixture(db, "A");
    const orgB = await seedOrganizationFixture(db, "B");

    const prospect = await db.prospect.create({
      data: {
        organizationId: orgA.organizationId,
        campaignId: orgA.campaignId,
        name: "Nombre original",
        phoneE164: "+14155550004",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });

    const result = await updateProspectScoped(db, orgB.organizationId, prospect.id, {
      name: "Nombre hackeado",
    });
    expect(result.count).toBe(0);

    const unchanged = await db.prospect.findUnique({ where: { id: prospect.id } });
    expect(unchanged?.name).toBe("Nombre original");
  });

  it("permite mismo número de teléfono en organizaciones distintas (unicidad es por organización)", async () => {
    const orgA = await seedOrganizationFixture(db, "A");
    const orgB = await seedOrganizationFixture(db, "B");
    const samePhone = "+14155550099";

    await expect(
      db.prospect.create({
        data: {
          organizationId: orgA.organizationId,
          campaignId: orgA.campaignId,
          name: "Prospecto A",
          phoneE164: samePhone,
          timezone: "America/Bogota",
          intent: "test",
          desiredOutcome: "test",
          source: "test",
        },
      }),
    ).resolves.toBeDefined();

    await expect(
      db.prospect.create({
        data: {
          organizationId: orgB.organizationId,
          campaignId: orgB.campaignId,
          name: "Prospecto B",
          phoneE164: samePhone,
          timezone: "America/Bogota",
          intent: "test",
          desiredOutcome: "test",
          source: "test",
        },
      }),
    ).resolves.toBeDefined();
  });

  it("rechaza duplicar el mismo teléfono dentro de la misma organización", async () => {
    const orgA = await seedOrganizationFixture(db, "A");
    const samePhone = "+14155550088";

    await db.prospect.create({
      data: {
        organizationId: orgA.organizationId,
        campaignId: orgA.campaignId,
        name: "Original",
        phoneE164: samePhone,
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });

    await expect(
      db.prospect.create({
        data: {
          organizationId: orgA.organizationId,
          campaignId: orgA.campaignId,
          name: "Duplicado",
          phoneE164: samePhone,
          timezone: "America/Bogota",
          intent: "test",
          desiredOutcome: "test",
          source: "test",
        },
      }),
    ).rejects.toThrow();
  });
});
