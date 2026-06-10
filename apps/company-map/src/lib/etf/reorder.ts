// 드래그 항목을 드롭 대상의 원래 인덱스 위치로 옮긴 새 배열 (표준 arrayMove 의미론).
// 입력 불변, 어떤 입력에도 throw하지 않는다.
export function moveCode(codes: string[], dragCode: string, dropCode: string): string[] {
  const from = codes.indexOf(dragCode);
  const to = codes.indexOf(dropCode);
  if (from === -1 || to === -1 || from === to) return [...codes];
  const next = [...codes];
  next.splice(from, 1);
  next.splice(to, 0, dragCode);
  return next;
}
