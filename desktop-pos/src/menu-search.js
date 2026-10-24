export const searchTextMatches = (query, value) => {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedQuery || normalizedValue.includes(normalizedQuery)) return Boolean(normalizedValue);

  const queryWords = normalizedQuery.split(/\s+/);
  const valueWords = normalizedValue.split(/[\s-]+/);
  return queryWords.every((queryWord) => valueWords.some((valueWord) => {
    if (valueWord.startsWith(queryWord)) return true;
    if (queryWord.length < 4 || valueWord.length < 4 || Math.abs(queryWord.length - valueWord.length) > 1) return false;

    let previousRow = Array.from({ length: valueWord.length + 1 }, (_, index) => index);
    for (let row = 1; row <= queryWord.length; row += 1) {
      const currentRow = [row];
      for (let column = 1; column <= valueWord.length; column += 1) {
        currentRow[column] = Math.min(
          currentRow[column - 1] + 1,
          previousRow[column] + 1,
          previousRow[column - 1] + (queryWord[row - 1] === valueWord[column - 1] ? 0 : 1)
        );
      }
      previousRow = currentRow;
    }
    return previousRow[valueWord.length] <= 1;
  }));
};
