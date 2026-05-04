"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Industry, IndustryNode } from "@/types/industry";

export async function listIndustries(): Promise<Industry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getIndustry(id: string): Promise<Industry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getIndustryTree(): Promise<IndustryNode[]> {
  const all = await listIndustries();
  const byId = new Map<string, IndustryNode>();
  all.forEach((i) => byId.set(i.id, { ...i, children: [] }));
  const roots: IndustryNode[] = [];
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .insert({
      name: input.name,
      parent_id: input.parent_id,
      description: input.description ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/industries");
  revalidatePath("/");
  return data;
}

export async function updateIndustry(
  id: string,
  input: { name?: string; parent_id?: string | null; description?: string | null },
): Promise<Industry> {
  if (input.parent_id !== undefined && input.parent_id !== null) {
    // 순환 참조 검증: 새 부모가 자기 자신의 자손이면 거부
    const descendants = await collectDescendantIds(id);
    if (input.parent_id === id || descendants.has(input.parent_id)) {
      throw new Error("순환 참조: 자기 자신 또는 자손을 부모로 지정할 수 없습니다.");
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/industries");
  revalidatePath(`/industries/${id}`);
  revalidatePath("/");
  return data;
}

export async function deleteIndustry(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("industries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/industries");
  revalidatePath("/");
}

async function collectDescendantIds(rootId: string): Promise<Set<string>> {
  const all = await listIndustries();
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    all
      .filter((i) => i.parent_id === cur)
      .forEach((c) => {
        if (!out.has(c.id)) {
          out.add(c.id);
          stack.push(c.id);
        }
      });
  }
  return out;
}
