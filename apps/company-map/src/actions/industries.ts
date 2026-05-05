"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { Industry, IndustryNode } from "@/types/industry";

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

export async function listIndustries(): Promise<Industry[]> {
  const rows = await db.industry.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
  return rows.map(toDomainIndustry);
}

export async function getIndustry(id: string): Promise<Industry | null> {
  const row = await db.industry.findUnique({ where: { id } });
  return row ? toDomainIndustry(row) : null;
}

export async function getIndustryTree(): Promise<IndustryNode[]> {
  const all = await listIndustries();
  const byId = new Map<string, IndustryNode>();
  all.forEach((i) => byId.set(i.id, { ...i, children: [] }));
  const roots: IndustryNode[] = [];
  byId.forEach((node) => {
    if (node.parent_id && node.parent_id !== node.id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export async function createIndustry(input: {
  name: string;
  parent_id: string | null;
  description?: string | null;
}): Promise<Industry> {
  const row = await db.industry.create({
    data: {
      name: input.name,
      parentId: input.parent_id,
      description: input.description ?? null,
    },
  });
  revalidatePath("/industries");
  revalidatePath("/");
  return toDomainIndustry(row);
}

export async function updateIndustry(
  id: string,
  input: { name?: string; parent_id?: string | null; description?: string | null },
): Promise<Industry> {
  if (input.parent_id !== undefined && input.parent_id !== null) {
    const descendants = await collectDescendantIds(id);
    if (input.parent_id === id || descendants.has(input.parent_id)) {
      throw new Error("순환 참조: 자기 자신 또는 자손을 부모로 지정할 수 없습니다.");
    }
  }
  const row = await db.industry.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.parent_id !== undefined ? { parentId: input.parent_id } : {}),
    },
  });
  revalidatePath("/industries");
  revalidatePath(`/industries/${id}`);
  revalidatePath("/");
  return toDomainIndustry(row);
}

export async function deleteIndustry(id: string): Promise<void> {
  await db.industry.delete({ where: { id } });
  revalidatePath("/industries");
  revalidatePath("/");
}

async function collectDescendantIds(rootId: string): Promise<Set<string>> {
  const all = await db.industry.findMany({ select: { id: true, parentId: true } });
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    all
      .filter((i) => i.parentId === cur)
      .forEach((c) => {
        if (!out.has(c.id)) {
          out.add(c.id);
          stack.push(c.id);
        }
      });
  }
  return out;
}
