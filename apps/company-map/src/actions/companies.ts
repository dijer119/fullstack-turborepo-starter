"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types/company";

const PAGE_SIZE = 50;

/** PostgREST filter syntax の構造文字/ワイルドカードをエスケープ。 */
function escapeIlikePattern(input: string): string {
  return input.replace(/([\\,()*])/g, "\\$1");
}

export async function listCompanies(opts?: {
  search?: string;
  page?: number;
}): Promise<{ rows: Company[]; total: number }> {
  const supabase = await createClient();
  const page = opts?.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let q = supabase.from("companies").select("*", { count: "exact" }).order("name");
  if (opts?.search) {
    const safe = escapeIlikePattern(opts.search);
    q = q.or(`name.ilike.%${safe}%,ticker.ilike.%${safe}%`);
  }
  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function searchCompanies(query: string, limit = 20): Promise<Company[]> {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const safe = escapeIlikePattern(query);
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .or(`name.ilike.%${safe}%,ticker.ilike.%${safe}%`)
    .limit(limit)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCompany(input: {
  name: string;
  ticker?: string | null;
  market?: string | null;
  description?: string | null;
}): Promise<Company> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: input.name,
      ticker: input.ticker || null,
      market: input.market || null,
      description: input.description || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/companies");
  return data;
}

export async function updateCompany(
  id: string,
  input: Partial<Omit<Company, "id" | "created_at" | "updated_at">>,
): Promise<Company> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return data;
}

export async function deleteCompany(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/companies");
}
