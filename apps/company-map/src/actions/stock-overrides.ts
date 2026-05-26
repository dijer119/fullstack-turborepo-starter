"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

/**
 * 수동 ROE 설정. roe=null이면 row 삭제 (자동 추정으로 복귀).
 * 값은 % 단위 (예: 9.98 = 9.98%). 음수 허용 (적자 ROE).
 */
export async function setManualRoe(
  code: string,
  roe: number | null,
): Promise<void> {
  if (!/^\d{6}$/.test(code)) return;

  if (roe === null) {
    await db.stockOverride.deleteMany({ where: { code } });
  } else {
    if (!Number.isFinite(roe)) return;
    await db.stockOverride.upsert({
      where: { code },
      create: { code, manualRoe: roe },
      update: { manualRoe: roe },
    });
  }
  revalidatePath("/stocks");
}
