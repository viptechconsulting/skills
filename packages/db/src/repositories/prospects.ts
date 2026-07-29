import type { Prisma, PrismaClient, ProspectStatus } from "../../generated/client/index.js";

/**
 * Todas las funciones de este repositorio reciben `organizationId`
 * explícitamente y lo inyectan en cada `where`. Esta es la única forma
 * soportada de consultar prospectos — nunca se debe llamar
 * `prisma.prospect.findMany` directamente fuera de este archivo, para
 * garantizar que ninguna consulta pueda cruzar organizaciones por error.
 */

export function findProspectsByOrganization(
  db: PrismaClient,
  organizationId: string,
  args: { campaignId?: string; status?: ProspectStatus; skip?: number; take?: number } = {},
) {
  return db.prospect.findMany({
    where: {
      organizationId,
      ...(args.campaignId ? { campaignId: args.campaignId } : {}),
      ...(args.status ? { status: args.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip: args.skip,
    take: args.take,
  });
}

export function findProspectByIdScoped(db: PrismaClient, organizationId: string, prospectId: string) {
  return db.prospect.findFirst({ where: { id: prospectId, organizationId } });
}

export function findProspectByPhoneScoped(db: PrismaClient, organizationId: string, phoneE164: string) {
  return db.prospect.findFirst({ where: { organizationId, phoneE164 } });
}

export function updateProspectScoped(
  db: PrismaClient,
  organizationId: string,
  prospectId: string,
  data: Prisma.ProspectUpdateInput,
) {
  // updateMany en vez de update para que organizationId forme parte del
  // WHERE (update() solo filtra por PK, lo que permitiría editar un
  // prospecto de otra organización si el id se adivinara).
  return db.prospect.updateMany({ where: { id: prospectId, organizationId }, data });
}
