import { parse } from "csv-parse/sync";
import { prisma } from "@lynkro-outbound/db";
import { csvProspectRowSchema, normalizePhoneToE164, type CsvImportResult } from "@lynkro-outbound/shared";

export async function importProspectsFromCsv(organizationId: string, csvContent: string): Promise<CsvImportResult> {
  const rawRows: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let created = 0;
  let updatedDuplicates = 0;
  let rejected = 0;
  const errors: { row: number; message: string }[] = [];

  // Se valida contra la organización ANTES del insert: sin esto, una fila con
  // un campaignId inexistente o de otra organización revienta con una
  // violación de foreign key sin capturar, aborta el loop entero y deja de
  // procesar el resto del archivo (las filas ya creadas antes del error
  // quedan, pero todo lo que venía después se pierde sin reportarse).
  const validCampaignIds = new Set(
    (await prisma.campaign.findMany({ where: { organizationId }, select: { id: true } })).map((c) => c.id),
  );

  for (let i = 0; i < rawRows.length; i += 1) {
    const rowNumber = i + 2; // +1 por índice base 0, +1 por la fila de encabezados
    const rawRow = rawRows[i];

    const parsedRow = csvProspectRowSchema.safeParse(rawRow);
    if (!parsedRow.success) {
      rejected += 1;
      errors.push({ row: rowNumber, message: parsedRow.error.issues.map((iss) => iss.message).join("; ") });
      continue;
    }

    if (parsedRow.data.campaignId && !validCampaignIds.has(parsedRow.data.campaignId)) {
      rejected += 1;
      errors.push({
        row: rowNumber,
        message: `La campaña "${parsedRow.data.campaignId}" no existe en esta organización.`,
      });
      continue;
    }

    const normalized = normalizePhoneToE164(parsedRow.data.phone);
    if (!normalized.ok || !normalized.e164) {
      rejected += 1;
      errors.push({ row: rowNumber, message: `Teléfono inválido: ${normalized.reason}` });
      continue;
    }

    const tags = parsedRow.data.tags
      ? parsedRow.data.tags.split("|").map((t) => t.trim()).filter(Boolean)
      : [];

    const existing = await prisma.prospect.findFirst({
      where: { organizationId, phoneE164: normalized.e164 },
    });

    if (existing) {
      await prisma.prospect.update({
        where: { id: existing.id },
        data: {
          name: parsedRow.data.name,
          company: parsedRow.data.company,
          email: parsedRow.data.email,
          language: parsedRow.data.language,
          timezone: parsedRow.data.timezone,
          context: parsedRow.data.context,
          intent: parsedRow.data.intent,
          desiredOutcome: parsedRow.data.desiredOutcome,
          source: parsedRow.data.source,
          consentGiven: parsedRow.data.consentGiven,
          consentDate: parsedRow.data.consentDate ? new Date(parsedRow.data.consentDate) : existing.consentDate,
          tags,
          campaignId: parsedRow.data.campaignId ?? existing.campaignId,
        },
      });
      updatedDuplicates += 1;
      continue;
    }

    await prisma.prospect.create({
      data: {
        organizationId,
        campaignId: parsedRow.data.campaignId,
        name: parsedRow.data.name,
        phoneE164: normalized.e164,
        company: parsedRow.data.company,
        email: parsedRow.data.email,
        language: parsedRow.data.language,
        timezone: parsedRow.data.timezone,
        context: parsedRow.data.context,
        intent: parsedRow.data.intent,
        desiredOutcome: parsedRow.data.desiredOutcome,
        source: parsedRow.data.source,
        consentGiven: parsedRow.data.consentGiven,
        consentDate: parsedRow.data.consentDate ? new Date(parsedRow.data.consentDate) : undefined,
        tags,
        status: "new",
      },
    });
    created += 1;
  }

  return { totalRows: rawRows.length, created, updatedDuplicates, rejected, errors };
}
