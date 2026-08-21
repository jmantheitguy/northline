/**
 * PostgreSQL folds unquoted identifiers to lowercase. Northline's SQLite
 * queries intentionally use camelCase result aliases (for example `ownerId`)
 * because the browser/API contract is shared by both database drivers. Quote
 * those aliases before sending a query so Postgres preserves the contract.
 */
const camelAlias = "[a-z_][A-Za-z0-9]*[A-Z][A-Za-z0-9_]*";

function transformSqlOutsideQuotes(input: string, transform: (segment: string) => string) {
  let output = "";
  let segment = "";
  const flush = () => {
    if (segment) {
      output += transform(segment);
      segment = "";
    }
  };
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character !== "'" && character !== '"' && character !== "`") {
      segment += character;
      continue;
    }
    flush();
    const quote = character;
    output += character;
    for (index += 1; index < input.length; index += 1) {
      const quoted = input[index];
      output += quoted;
      if (quoted === quote) {
        if (input[index + 1] === quote) {
          output += input[index + 1];
          index += 1;
          continue;
        }
        break;
      }
    }
  }
  flush();
  return output;
}

export function quoteCamelCaseAliases(input: string) {
  return transformSqlOutsideQuotes(input, (segment) => {
    const withAs = new RegExp(`\\bAS\\s+(${camelAlias})\\b`, "g");
    const withBareAlias = new RegExp(
      `(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*\\.)?[A-Za-z_][A-Za-z0-9_]*\\s+(${camelAlias})\\b`,
      "g",
    );
    return segment
      .replace(withAs, (_match, alias: string) => `AS "${alias}"`)
      .replace(withBareAlias, (match, _qualified: string, alias: string) =>
        match.slice(0, match.length - alias.length) + `"${alias}"`,
      );
  });
}
