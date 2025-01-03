import { suite, test } from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';
import { unlink } from 'node:fs/promises';

import { csvStreamEqualWritable, createCSVMockStream, createTempFile } from './utils.js';
import { arrayToCSVString, createCSVReadableStream, createCSVTransformStream, createCSVWritableStream } from '../src/core.js';

suite('arrayToCSVString', { concurrency: true }, () => {
  const vectors = [
    { name: 'converts simple row', input: ['abc', '123'], output: 'abc,123\r\n' },
    { name: 'converts row with commas', input: ['a,bc', '12,3'], output: '"a,bc","12,3"\r\n' },
    { name: 'converts row with double quotes', input: ['a"bc', '12"3'], output: '"a""bc","12""3"\r\n' },
    { name: 'converts row with newlines', input: ['a\nbc', '12\r\n3'], output: '"a\nbc","12\r\n3"\r\n' },
    { name: 'converts row with mixed escaped characters', input: ['a,"\nbc', '12,"\r\n3'], output: '"a,""\nbc","12,""\r\n3"\r\n' },
    { name: 'converts single value (no commas) row', input: ['abc'], output: 'abc\r\n' },
    { name: 'converts empty row', input: [''], output: '\r\n' },
    { name: 'converts empty row with multiple fields', input: ['', '', '', ''], output: ',,,\r\n' }
  ];
  for (const { name, input, output } of vectors) {
    test(name, { concurrency: true }, () => {
      deepStrictEqual(arrayToCSVString(input), output);
    });
  }
});

suite('createCSVReadableStream', { concurrency: true }, () => {
  const vectors = [
    {
      name: 'parses simple CSV',
      input: './test/data/simple.csv',
      output: [
        ['column1', 'column2', 'column3'],
        ['abc', 'def', 'ghi'],
        ['123', '456', '789'],
        ['aaa', 'bbb', 'ccc']
      ]
    },
    {
      name: 'parses escaping CSV',
      input: './test/data/escaping.csv',
      output: [
        ['name', 'value'],
        ['Three spaces', '   '],
        ['Three commas', ',,,'],
        ['Three newlines', '\r\n\r\n\r\n'],
        ['Three unescaped double quotes', 'a"""'],
        ['Three escaped double quotes', '"""'],
        ['Unescaped double quotes around delimiter 1 "', 'a'],
        ['Unescaped double quotes around delimiter 2 ""', 'a'],
        ['Unescaped double quotes around delimiter 3 """', 'a'],
        ['Unescaped double quotes around delimiter 4', ' "'],
        ['Unescaped double quotes around delimiter 5', ' ""'],
        ['Unescaped double quotes around delimiter 6', ' """'],
        ['Spaces before and after a value', '   abc   '],
        ['Spaces before and after three unescaped double quotes', '   """   '],
        ['Spaces trailing escaped double quotes', 'abc   '],
        ['Characters trailing escaped double quotes', 'abc def'],
        ['Unescaped double quotes trailing escaped double quotes', 'abc " def 123 """ 456'],
        ['Unescaped "double quotes" trailing escaped double quotes', 'abc """ def 123 """ 456'],
        ['Unicode test 1', '你好'],
        ['Unicode test 2', '😂👌👍'],
        ['Unicode test 3', '🏴‍☠️👨‍👩‍👧‍👦'],
        ['Mixed', ',\r\n",\r\n",\r\n"']
      ]
    },
    {
      name: 'parses escaping edges CSV',
      input: './test/data/escaping-edges.csv',
      output: [
        [',,,', '"""'],
        ['"""', ',,,'],
        ['a"b""', 'a"b""'],
        ['a"b""', 'a"b""']
      ]
    },
    {
      name: 'parses sparse CSV',
      input: './test/data/sparse.csv',
      output: [
        ['column1', 'column2', 'column3'],
        [''],
        ['', ''],
        ['', '', ''],
        ['', '', '', ''],
        ['', '', '', '', ''],
        ['aaa', 'bbb', 'ccc'],
        ['111', '222', '333', '444', '555', '666', '777', '888'],
        ['', 'hhh', 'iii'],
        ['ggg', '', 'iii'],
        ['ggg', 'hhh', ''],
        ['', 'hhh', ''],
        ['ggg', '', ''],
        ['', '', 'iii'],
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
        [''],
        ['']
      ]
    },
    {
      name: 'parses line feed end-of-line CSV',
      input: './test/data/lf-eol.csv',
      output: [
        ['column1', 'column2'],
        ['a', 'b'],
        ['c', 'd'],
        ['1', '2'],
        ['3', '4']
      ]
    },
    {
      name: 'parses byte order mark CSV',
      input: './test/data/bom.csv',
      output: [
        ['column1', 'column2'],
        ['ab', 'cd'],
        ['12', '34']
      ]
    },
    {
      name: 'parses single value (no commas or newlines) CSV',
      input: './test/data/single-value.csv',
      output: [
        ['abc']
      ]
    },
    {
      name: 'parses single column (no commas) CSV',
      input: './test/data/single-column.csv',
      output: [
        ['abc'],
        ['def'],
        ['ghi']
      ]
    },
    {
      name: 'parses single row (no newlines) CSV',
      input: './test/data/single-row.csv',
      output: [
        ['abc', 'def', 'ghi']
      ]
    },
    {
      name: 'parses blank CSV',
      input: './test/data/blank.csv',
      output: [
        ['']
      ]
    }
  ];
  for (const { name, input, output } of vectors) {
    test(name, { concurrency: true }, async () => {
      await createCSVReadableStream(input).pipeTo(csvStreamEqualWritable(output));
    });
  }
});

suite('createCSVTransformStream', { concurrency: true }, () => {
  test('passes through CSV', { concurrency: true }, async () => {
    const csv = [
      ['columnA', 'columnB'],
      ['a', 'b']
    ];
    await createCSVMockStream(csv)
      .pipeThrough(createCSVTransformStream(r => r))
      .pipeTo(csvStreamEqualWritable(csv));
  });
  test('passes through raw output', { concurrency: true }, async () => {
    await createCSVMockStream([
      ['columnA', 'columnB'],
      ['a', 'b']
    ])
      .pipeThrough(createCSVTransformStream(() => '["abc", "def"]', { includeHeaders: true, rawOutput: true }))
      .pipeTo(csvStreamEqualWritable([
        ['abc', 'def'],
        ['abc', 'def']
      ]));
  });
  test('transforms data in place', { concurrency: true }, async () => {
    function timesTwo(row) {
      return [Number(row[0]) * 2, Number(row[1]) * 2];
    }
    await createCSVMockStream([
      ['columnA', 'columnB'],
      ['1', '1'],
      ['100', '100'],
      ['223423', '455947'],
      ['348553', '692708'],
      ['536368', '676147']
    ])
      .pipeThrough(createCSVTransformStream(timesTwo))
      .pipeTo(csvStreamEqualWritable([
        ['columnA', 'columnB'],
        [2, 2],
        [200, 200],
        [446846, 911894],
        [697106, 1385416],
        [1072736, 1352294]
      ]));
  });
  test('can add new column', { concurrency: true }, async () => {
    let firstRow = true;
    function sum(row) {
      if (firstRow) {
        firstRow = false;
        return [...row, 'sum'];
      }
      return [...row, Number(row[0]) + Number(row[1])];
    }
    await createCSVMockStream([
      ['columnA', 'columnB'],
      ['1', '1'],
      ['100', '100'],
      ['223423', '455947'],
      ['348553', '692708'],
      ['536368', '676147']
    ])
      .pipeThrough(createCSVTransformStream(sum, { includeHeaders: true }))
      .pipeTo(csvStreamEqualWritable([
        ['columnA', 'columnB', 'sum'],
        ['1', '1', 2],
        ['100', '100', 200],
        ['223423', '455947', 679370],
        ['348553', '692708', 1041261],
        ['536368', '676147', 1212515]
      ]));
  });
});

suite('createCSVWritableStream', { concurrency: true }, () => {
  const vectors = [
    {
      name: 'writes simple CSV',
      csv: [
        ['column1', 'column2', 'column3'],
        ['abc', 'def', 'ghi'],
        ['123', '456', '789'],
        ['aaa', 'bbb', 'ccc']
      ]
    },
    {
      name: 'writes escaping CSV',
      csv: [
        ['name', 'value'],
        ['Three spaces', '   '],
        ['Three commas', ',,,'],
        ['Three newlines', '\r\n\r\n\r\n'],
        ['Three unescaped double quotes', 'a"""'],
        ['Three escaped double quotes', '"""'],
        ['Unescaped double quotes around delimiter 1 "', 'a'],
        ['Unescaped double quotes around delimiter 2 ""', 'a'],
        ['Unescaped double quotes around delimiter 3 """', 'a'],
        ['Unescaped double quotes around delimiter 4', ' "'],
        ['Unescaped double quotes around delimiter 5', ' ""'],
        ['Unescaped double quotes around delimiter 6', ' """'],
        ['Spaces before and after a value', '   abc   '],
        ['Spaces before and after three unescaped double quotes', '   """   '],
        ['Spaces trailing escaped double quotes', 'abc   '],
        ['Characters trailing escaped double quotes', 'abc def'],
        ['Unescaped double quotes trailing escaped double quotes', 'abc " def 123 """ 456'],
        ['Unescaped "double quotes" trailing escaped double quotes', 'abc """ def 123 """ 456'],
        ['Unicode test 1', '你好'],
        ['Unicode test 2', '😂👌👍'],
        ['Unicode test 3', '🏴‍☠️👨‍👩‍👧‍👦'],
        ['Mixed', ',\r\n",\r\n",\r\n"']
      ]
    },
    {
      name: 'writes escaping edges CSV',
      csv: [
        [',,,', '"""'],
        ['"""', ',,,'],
        ['a"b""', 'a"b""'],
        ['a"b""', 'a"b""']
      ]
    },
    {
      name: 'writes sparse CSV',
      csv: [
        ['column1', 'column2', 'column3'],
        [''],
        ['', ''],
        ['', '', ''],
        ['', '', '', ''],
        ['', '', '', '', ''],
        ['aaa', 'bbb', 'ccc'],
        ['111', '222', '333', '444', '555', '666', '777', '888'],
        ['', 'hhh', 'iii'],
        ['ggg', '', 'iii'],
        ['ggg', 'hhh', ''],
        ['', 'hhh', ''],
        ['ggg', '', ''],
        ['', '', 'iii'],
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
        [''],
        ['']
      ]
    },
    {
      name: 'writes single value (no commas or newlines) CSV',
      csv: [
        ['abc']
      ]
    },
    {
      name: 'writes single column (no commas) CSV',
      csv: [
        ['abc'],
        ['def'],
        ['ghi']
      ]
    },
    {
      name: 'writes single row (no newlines) CSV',
      csv: [
        ['abc', 'def', 'ghi']
      ]
    },
    {
      name: 'writes blank CSV',
      csv: [
        ['']
      ]
    }
  ];
  for (const { name, csv } of vectors) {
    test(name, { concurrency: true }, async (t) => {
      const temp = await createTempFile();
      t.after(async () => await unlink(temp));
      await createCSVMockStream(csv).pipeTo(createCSVWritableStream(temp));
      await createCSVReadableStream(temp).pipeTo(csvStreamEqualWritable(csv));
    });
  }
});