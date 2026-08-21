// Pulls a JSON object out of a model's raw text response — handles a bare
// object, one wrapped in a ```json fenced block, or one preceded/followed
// by extra prose. Falls back to returning the text unchanged (which will
// then fail JSON.parse with a clear error) if no object shape is found.
export function extractJsonFromModelText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}
