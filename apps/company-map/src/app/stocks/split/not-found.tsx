import Link from "next/link";

export default function SplitNotFound() {
  return <main className="mx-auto max-w-3xl space-y-4 px-4 py-12"><h1 className="text-xl font-bold">전략을 찾을 수 없습니다</h1><p className="text-sm text-muted">삭제되었거나 주소가 올바르지 않습니다.</p><Link href="/stocks/split" className="text-blue-ink hover:underline">종목 목록으로 돌아가기</Link></main>;
}
