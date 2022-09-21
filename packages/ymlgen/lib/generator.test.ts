import { GeneratorFactory, processFile, TextGenerator } from "./generator";

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
  const getGenerator: GeneratorFactory<unknown> = async (_) => {
    return async ({ write, $each }) => {
      await write()`${$each([1], subGenerator, {
        extra: { extraData: "extra" },
      })}`;
    };
  };
  const writeFile = createFileWriter(results);

  await processFile({
    generatorWorkspaceDir: "",
    dataFileWorkspaceDir: "",
    dataFile: "test.yml",
    fileName: "test",
    content,
    getGenerator,
    writeFile,
  });

  expect(results).toEqual(["test.js:0:1:extra"]);
});

test("custom generator", async () => {
  const results: string[] = [];
  const content = `    
    # ymlgen:generator { name: gen1, output: '*.js' }
    # ymlgen:generator { name: gen2, output: '*.ts' }
    
    prop: 1
  `;
  const getGenerator: GeneratorFactory<unknown> = async (name) => {
    return async ({ write }) => {
      await write(name);
    };
  };
  const writeFile = createFileWriter(results);

  await processFile({
    generatorWorkspaceDir: "",
    dataFileWorkspaceDir: "",
    dataFile: "test.yml",
    fileName: "test",
    content,
    getGenerator,
    writeFile,
  });

  expect(results).toEqual(["test.js:gen1", "test.ts:gen2"]);
});

test("$each", async () => {
  const results: string[] = [];
  const content = `    
    # ymlgen:generator abc
    # ymlgen:output *.js
    prop: [1, 2, 3]
  `;
  const getGenerator: GeneratorFactory<unknown> = async () => {
    return async ({ write, data, $each }) => {
      await write()`
        BEGIN${"aaa"}
        ${$each(data.prop, async ({ write, data }) => write(data), {
          start: "list1",
        })}
        ${$each(data.prop, async ({ write, data }) => write(data), {
          start: "list2",
        })}
        END`;
    };
  };
  const writeFile = createFileWriter(results);

  await processFile({
    generatorWorkspaceDir: "",
    dataFileWorkspaceDir: "",
    dataFile: "test.yml",
    fileName: "test",
    content,
    getGenerator,
    writeFile,
  });

  console.log(results);
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
  const getGenerator: GeneratorFactory<unknown> = async (_) => {
    return async ({ data, write }) => {
      await write(data.prop3);
    };
  };
  const writeFile = createFileWriter(results);

  await processFile({
    generatorWorkspaceDir: "",
    dataFileWorkspaceDir: "",
    dataFile: "test.yml",
    fileName: "test",
    content,
    getGenerator,
    writeFile,
  });

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
  const getGenerator: GeneratorFactory<unknown> = async (_) => {
    return async ({ data, write }) => {
      await write(JSON.stringify(data));
    };
  };
  const writeFile = createFileWriter(results);
  const includeFileReader = () => ({ prop1: { prop2: { prop4: 2 } } });

  await processFile({
    generatorWorkspaceDir: "",
    dataFileWorkspaceDir: "",
    dataFile: "test.yml",
    fileName: "test",
    content,
    getGenerator,
    writeFile,
    includeFileReader,
  });
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
  const getGenerator: GeneratorFactory<unknown> = async (_) => {
    return async ({ data, rawData, write }) => {
      await write(JSON.stringify({ data, rawData }));
    };
  };
  const writeFile = createFileWriter(results);
  const includeFileReader = () => ({ prop1: { prop2: { prop4: 2 } } });

  await processFile({
    generatorWorkspaceDir: "",
    dataFileWorkspaceDir: "",
    dataFile: "test.yml",
    fileName: "test",
    content,
    getGenerator,
    writeFile,
    includeFileReader,
  });

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

test("passing extra props down", async () => {
  const results: string[] = [];
  const content = `    
    # ymlgen:generator abc
    # ymlgen:output *.js
    prop: [1, 2, 3]
  `;
  const renderer1: TextGenerator<{ rootData: string }> = ({
    rootData,
    write,
    $use,
  }) => {
    write(rootData);
    write($use(undefined, renderer2));
  };
  const renderer2: TextGenerator<{ rootData: string }> = ({
    rootData,
    write,
  }) => {
    write(rootData);
  };
  const getGenerator: GeneratorFactory<unknown> = async () => {
    return ({ write, $use, extra }) => {
      extra({ rootData: "root" });
      write($use(undefined, renderer1));
    };
  };
  const writeFile = createFileWriter(results);

  await processFile({
    generatorWorkspaceDir: "",
    dataFileWorkspaceDir: "",
    dataFile: "test.yml",
    fileName: "test",
    content,
    getGenerator,
    writeFile,
  });

  expect(results).toEqual(["test.js:rootroot"]);
});
