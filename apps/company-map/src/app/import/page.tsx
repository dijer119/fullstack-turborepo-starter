"use client";

import { useState } from "react";
import { parseCsvFile, type ParseResult } from "@/lib/csv/parser";
import { importCompaniesAction, type ImportResult } from "@/actions/import";

export default function ImportPage() {
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [running, setRunning] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResult(null);
    setParse(await parseCsvFile(f));
  }

  async function onConfirm() {
    if (!parse) return;
    setRunning(true);
    try {
      setResult(await importCompaniesAction(parse.rows));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">CSV Import</h2>
      <p className="text-sm text-gray-500">
        지원 컬럼: <code>name</code>(또는 종목명/회사명), <code>ticker</code>(선택), <code>market</code>(선택)
      </p>
      <input
        type="file"
        accept=".csv"
        onChange={onFile}
        className="block border rounded p-2 w-full"
      />

      {parse && (
        <div className="border rounded p-3 space-y-2">
          <div className="text-sm">
            파싱 결과: <b>{parse.rows.length}</b>행 / 오류 {parse.errors.length}건
          </div>
          {parse.errors.length > 0 && (
            <ul className="text-xs text-red-600 list-disc pl-5">
              {parse.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="p-1">name</th>
                <th className="p-1">ticker</th>
                <th className="p-1">market</th>
              </tr>
            </thead>
            <tbody>
              {parse.rows.slice(0, 10).map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="p-1">{r.name}</td>
                  <td className="p-1">{r.ticker}</td>
                  <td className="p-1">{r.market}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={onConfirm}
            disabled={running || parse.rows.length === 0}
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
          >
            {running ? "Importing…" : `${parse.rows.length}행 일괄 등록`}
          </button>
        </div>
      )}

      {result && (
        <div className="border rounded p-3 bg-green-50 dark:bg-green-950 text-sm">
          ✅ 신규 <b>{result.inserted}</b>건 / 중복 skip <b>{result.skipped}</b>건 / 오류{" "}
          <b>{result.errors.length}</b>건
          {result.errors.length > 0 && (
            <ul className="text-xs text-red-600 list-disc pl-5 mt-2">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>
                  행 {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
