"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Company } from "@/types/company";

const PAGE_SIZE = 50;

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

export async function listCompanies(opts?: {
  search?: string;
  page?: number;
}): Promise<{ rows: Company[]; total: number }> {
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.CompanyWhereInput | undefined = opts?.search?.trim()
    ? {
        OR: [
          { name: { contains: opts.search } },
          { ticker: { contains: opts.search } },
        ],
      }
    : undefined;

  const [rows, total] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip,
      take: PAGE_SIZE,
    }),
    db.company.count({ where }),
  ]);

  return { rows: rows.map(toDomainCompany), total };
}

export async function getCompany(id: string): Promise<Company | null> {
  const row = await db.company.findUnique({ where: { id } });
  return row ? toDomainCompany(row) : null;
}

export async function searchCompanies(query: string, limit = 20): Promise<Company[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await db.company.findMany({
    where: {
      OR: [
        { name: { contains: trimmed } },
        { ticker: { contains: trimmed } },
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });
  return rows.map(toDomainCompany);
}

export async function createCompany(input: {
  name: string;
  ticker?: string | null;
  market?: string | null;
  description?: string | null;
}): Promise<Company> {
  const row = await db.company.create({
    data: {
      name: input.name,
      ticker: input.ticker?.trim() || null,
      market: input.market?.trim() || null,
      description: input.description?.trim() || null,
    },
  });
  revalidatePath("/companies");
  return toDomainCompany(row);
}

export async function updateCompany(
  id: string,
  input: Partial<Omit<Company, "id" | "created_at" | "updated_at">>,
): Promise<Company> {
  const row = await db.company.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.ticker !== undefined ? { ticker: input.ticker } : {}),
      ...(input.market !== undefined ? { market: input.market } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return toDomainCompany(row);
}

export async function deleteCompany(id: string): Promise<void> {
  await db.company.delete({ where: { id } });
  revalidatePath("/companies");
}
