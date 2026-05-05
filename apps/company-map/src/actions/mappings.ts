"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { Industry } from "@/types/industry";
import type { Company } from "@/types/company";

function toDomainIndustry(row: {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Industry {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parentId,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toDomainCompany(row: {
  id: string;
  name: string;
  ticker: string | null;
  market: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Company {
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    market: row.market,
    description: row.description,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function getIndustriesForCompany(companyId: string): Promise<Industry[]> {
  const rows = await db.companyIndustry.findMany({
    where: { companyId },
    include: { industry: true },
  });
  return rows.map((r) => toDomainIndustry(r.industry));
}

export async function getCompaniesForIndustry(industryId: string): Promise<Company[]> {
  const rows = await db.companyIndustry.findMany({
    where: { industryId },
    include: { company: true },
  });
  return rows.map((r) => toDomainCompany(r.company));
}

export async function addMapping(companyId: string, industryId: string): Promise<void> {
  await db.companyIndustry.upsert({
    where: { companyId_industryId: { companyId, industryId } },
    create: { companyId, industryId },
    update: {},
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/industries/${industryId}`);
  revalidatePath("/");
}

export async function removeMapping(companyId: string, industryId: string): Promise<void> {
  await db.companyIndustry.delete({
    where: { companyId_industryId: { companyId, industryId } },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/industries/${industryId}`);
  revalidatePath("/");
}

export async function setMappingsForCompany(
  companyId: string,
  industryIds: string[],
): Promise<void> {
  // SQLite는 단일 connection이라 transaction이 안전·효율적
  await db.$transaction([
    db.companyIndustry.deleteMany({ where: { companyId } }),
    ...(industryIds.length > 0
      ? [
          db.companyIndustry.createMany({
            data: industryIds.map((industryId) => ({ companyId, industryId })),
          }),
        ]
      : []),
  ]);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/");
}
