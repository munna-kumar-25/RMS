import assert from 'node:assert/strict';
import test from 'node:test';
import { createXlsxBuffer } from './xlsxExport.js';

const zipEntries = (buffer) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  let offset = 0;

  while (view.getUint32(offset, true) === 0x04034B50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(buffer.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(buffer.subarray(contentStart, contentStart + size)));
    offset = contentStart + size;
  }
  return entries;
};

test('creates a valid Excel workbook with escaped cells and numeric values', () => {
  const workbook = createXlsxBuffer([
    ['Menu Item', 'Price', 'Description'],
    ['<Special & Dish>', 120.5, '=SUM(A1:A2)'],
  ]);
  const entries = zipEntries(workbook);
  const worksheet = entries.get('xl/worksheets/sheet1.xml');

  assert.equal(new DataView(workbook.buffer).getUint32(0, true), 0x04034B50);
  assert.ok(entries.has('[Content_Types].xml'));
  assert.ok(entries.has('xl/workbook.xml'));
  assert.match(worksheet, /&lt;Special &amp; Dish&gt;/);
  assert.match(worksheet, /<c r="B2"><v>120\.5<\/v><\/c>/);
  assert.match(worksheet, /<c r="C2" t="inlineStr"><is><t xml:space="preserve">=SUM\(A1:A2\)<\/t><\/is><\/c>/);
});

test('rejects malformed spreadsheet rows', () => {
  assert.throws(() => createXlsxBuffer('not rows'), /array of rows/);
  assert.throws(() => createXlsxBuffer([['header'], null]), /array of rows/);
});
