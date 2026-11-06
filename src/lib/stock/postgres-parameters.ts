/** postgres.js serializes parameters inferred as jsonb itself; services also run
 * against drivers which expect JSON text. Normalize only explicitly cast JSON. */
export function stockParameters(statement:string,values:unknown[]):unknown[] {
 const result=[...values];
 for(const match of statement.matchAll(/\$(\d+)\s*::\s*jsonb\b/gi)) {
  const index=Number(match[1])-1;
  if(typeof result[index]==="string")result[index]=JSON.parse(result[index] as string);
 }
 return result;
}
