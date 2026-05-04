import Link from "next/link";
import { listCompanies } from "@/actions/companies";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search ?? "";
  const rawPage = Number(params.page ?? "1");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const { rows, total } = await listCompanies({ search, page });
  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Companies</h2>
        <Link href="/companies/new" className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm">+ 새 기업</Link>
      </div>

      <form className="flex gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="이름/종목코드 검색"
          className="border rounded px-3 py-1.5 text-sm flex-1 bg-white dark:bg-gray-900"
        />
        <button className="border rounded px-3 py-1.5 text-sm">검색</button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr className="text-left">
            <th className="p-2">이름</th>
            <th className="p-2">종목코드</th>
            <th className="p-2">시장</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="p-2 font-medium">{c.name}</td>
              <td className="p-2 text-gray-500">{c.ticker ?? "—"}</td>
              <td className="p-2 text-gray-500">{c.market ?? "—"}</td>
              <td className="p-2 text-right">
                <Link href={`/companies/${c.id}`} className="text-blue-600 text-xs hover:underline">상세</Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="p-4 text-center text-gray-500">기업이 없습니다.</td></tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex gap-2 justify-center text-sm">
          {page > 1 && (
            <Link href={`/companies?search=${encodeURIComponent(search)}&page=${page - 1}`} className="border rounded px-2 py-1">이전</Link>
          )}
          <span className="px-2 py-1">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={`/companies?search=${encodeURIComponent(search)}&page=${page + 1}`} className="border rounded px-2 py-1">다음</Link>
          )}
        </div>
      )}
    </div>
  );
}
