/** One sentence for the connections page. Names up to three, then a count. */
export function connectedLine(names: string[]): string {
  const list = names.map((name) => name.trim()).filter(Boolean);
  if (!list.length) return "Nothing is connected yet.";
  if (list.length === 1) return `${list[0]} is connected.`;
  if (list.length === 2) return `${list[0]} and ${list[1]} are connected.`;
  if (list.length === 3) return `${list[0]}, ${list[1]}, and ${list[2]} are connected.`;
  return `${list[0]}, ${list[1]}, and ${list.length - 2} more are connected.`;
}
