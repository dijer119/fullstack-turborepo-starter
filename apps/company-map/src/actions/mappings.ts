"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Industry } from "@/types/industry";
import type { Company } from "@/types/company";

export async function getIndustriesForCompany(companyId: string): Promise<Industry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_industries")
    .select("industry:industries(*)")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.industry as unknown as Industry).filter(Boolean);
}

export async function getCompaniesForIndustry(industryId: string): Promise<Company[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_industries")
    .select("company:companies(*)")
    .eq("industry_id", industryId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.company as unknown as Company).filter(Boolean);
}

export async function addMapping(
  companyId: string,
  industryId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_industries")
    .upsert({ company_id: companyId, industry_id: industryId });
  if (error) throw new Error(error.message);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/industries/${industryId}`);
  revalidatePath("/");
}

export async function removeMapping(
  companyId: string,
  industryId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_industries")
    .delete()
    .eq("company_id", companyId)
    .eq("industry_id", industryId);
  if (error) throw new Error(error.message);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/industries/${industryId}`);
  revalidatePath("/");
}

export async function setMappingsForCompany(
  companyId: string,
  industryIds: string[],
): Promise<void> {
  const supabase = await createClient();
  // 기존 모두 제거 후 일괄 insert (트랜잭션은 RPC로 가능하지만 단순화)
  const { error: delErr } = await supabase
    .from("company_industries")
    .delete()
    .eq("company_id", companyId);
  if (delErr) throw new Error(delErr.message);
  if (industryIds.length > 0) {
    const rows = industryIds.map((industry_id) => ({ company_id: companyId, industry_id }));
    const { error: insErr } = await supabase.from("company_industries").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/");
}
