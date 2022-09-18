import { processFile, TextGenerator } from "./generator";

const createFileWriter =
  (results: string[]) => async (file: string, data: string) => {
    results.push(`${file}:${data}`);
  };

test("each with extra", async () => {
  const results: string[] = [];
  const content = `    
  # ymlgen:generator test
  # ymlgen:output *.js
  prop: 1
  `;
  const subGenerator: TextGenerator<{ extraData: unknown }> = async ({
    write,
    key,
    data,
    extraData,
  }) => {
    await write(`${key}:${data}:${extraData}`);
  };
  await processFile(
    "test.yml",
    "test",
    content,
    async (_) => {
      return async ({ write, $each }) => {
        await write()`${$each([1], subGenerator, {
          extra: { extraData: "extra" },
        })}`;
      };
    },
    createFileWriter(results)
  );

  expect(results).toEqual(["test.js:0:1:extra"]);
});

test("custom generator", async () => {
  const results: string[] = [];
  const content = `    
    # ymlgen:generator { name: gen1, output: '*.js' }
    # ymlgen:generator { name: gen2, output: '*.ts' }
    
    prop: 1
  `;
  await processFile(
    "test.yml",
    "test",
    content,
    async (name) => {
      return async ({ write }) => {
        await write(name);
      };
    },
    createFileWriter(results)
  );
  expect(results).toEqual(["test.js:gen1", "test.ts:gen2"]);
});

test("select", async () => {
  const results: string[] = [];
  const content = `
    # ymlgen:output *.js    
    # ymlgen:generator test
    # ymlgen:select prop1.prop2
    
    prop1:
      prop2:
        prop3: 1
  `;
  await processFile(
    "test.yml",
    "test",
    content,
    async (_) => {
      return async ({ data, write }) => {
        await write(data.prop3);
      };
    },
    createFileWriter(results)
  );
  expect(results).toEqual(["test.js:1"]);
});

test("merge", async () => {
  const results: string[] = [];
  const content = `
    # ymlgen:output *.js    
    # ymlgen:generator test
    # ymlgen:merge abc
    
    prop1:
      prop2:
        prop3: 1
  `;
  await processFile(
    "test.yml",
    "test",
    content,
    async (_) => {
      return async ({ data, write }) => {
        await write(JSON.stringify(data));
      };
    },
    createFileWriter(results),
    undefined,
    () => ({ prop1: { prop2: { prop4: 2 } } })
  );
  expect(JSON.parse(results[0].substring(8))).toEqual({
    prop1: {
      prop2: {
        prop3: 1,
        prop4: 2,
      },
    },
  });
});

test("rawData", async () => {
  const results: string[] = [];
  const content = `
    # ymlgen:output *.js    
    # ymlgen:generator test
    # ymlgen:merge abc
    
    prop1:
      prop2:
        prop3: 1
  `;
  await processFile(
    "test.yml",
    "test",
    content,
    async (_) => {
      return async ({ data, rawData, write }) => {
        await write(JSON.stringify({ data, rawData }));
      };
    },
    createFileWriter(results),
    undefined,
    () => ({ prop1: { prop2: { prop4: 2 } } })
  );
  expect(JSON.parse(results[0].substring(8))).toEqual({
    rawData: {
      prop1: {
        prop2: {
          prop3: 1,
        },
      },
    },
    data: {
      prop1: {
        prop2: {
          prop3: 1,
          prop4: 2,
        },
      },
    },
  });
});
