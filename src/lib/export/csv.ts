/** RFC 4180 CSV, which is what REDCap's data dictionary import expects. */
export function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(cells: (string | number | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

export function toCsv(rows: (string | number | undefined)[][]): string {
  // CRLF line endings, as in REDCap's own exports.
  return rows.map(csvRow).join('\r\n') + '\r\n';
}

/** Tab-separated values, used by the LimeSurvey survey-structure import. */
export function toTsv(rows: (string | number | undefined)[][]): string {
  return (
    rows
      .map((row) =>
        row
          .map((cell) => {
            const text = cell === undefined ? '' : String(cell);
            return /["\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join('\t'),
      )
      .join('\n') + '\n'
  );
}
