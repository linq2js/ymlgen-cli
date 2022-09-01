import { parse } from "yamljs";
import { dirname, resolve, extname } from "path";
import * as fs from "fs";

export type AutoTrim = "start-end" | "all" | boolean;

export type WriteOptions = StringConvertionOptions & { autoTrim?: AutoTrim };

export type TemplateConfigs = { output: string; generator: string };

export type GenerationContext = {
  readonly dataFile: string;
  readonly texts: string[];
  readonly options: WriteOptions;
  readonly data: any;
  readonly key: any;
  $each: typeof $each;
  $use: typeof $use;
  extends(data: unknown, extraProps?: unknown): GenerationContext;
  write(...values: any[]): any;
  configure(options: WriteOptions): void;
};

export type EachOptions<T> = {
  sep?: TextGenerator<T>;
  start?: TextGenerator<T>;
  end?: TextGenerator<T>;
  alt?: TextGenerator<T>;
  extra?: any;
};

export type TextGenerator<TExtra> = (
  context: GenerationContext & TExtra
) => void | Promise<void>;

export type StringConvertionOptions = {};

const isDataFile = (content: string) => {
  return content.trimStart().startsWith("# ymlgen");
};

const readConfigs = (dir: string, content: string) => {
  let defaultOutput = "";
  let defaultGenerator = "";
  let defaultSelect = "";
  let onSuccess = "";
  let onFail = "";
  let onDone = "";
  const importedData: unknown[] = [];
  const generators: { output: string; name: string; select: string }[] = [];

  content.replace(/# ymlgen:([^\s]+) ([^\n]+)/g, (_, name, value: string) => {
    value = value.trim();
    switch (name) {
      case "import":
        const importFilePath = resolve(dir, value);
        const importFileContent = fs.readFileSync(importFilePath, "utf-8");
        const importExt = (extname(value) ?? "").toLowerCase();
        const data = importExt.endsWith(".json")
          ? // support JSON file
            JSON.parse(importFileContent)
          : // unless using yaml parser
            parse(importFileContent);
        importedData.push(data);
        break;
      case "success":
        onSuccess = value;
        break;
      case "fail":
        onFail = value;
        break;
      case "done":
        onDone = value;
        break;
      case "output":
        defaultOutput = value;
        break;
      case "select":
        defaultSelect = value;
        break;
      case "generator":
        // custom generator
        if (value.startsWith("{") && value.endsWith("}")) {
          generators.push(parse(value));
        } else {
          defaultGenerator = value;
        }
        break;
      default:
        throw new Error(`Invalid config ${name}`);
    }
    return "";
  });

  if (defaultGenerator) {
    if (!defaultOutput) {
      throw new Error("No ymlgen:output config found");
    }
    generators.push({
      name: defaultGenerator,
      output: defaultOutput,
      select: defaultSelect,
    });
  }

  if (!generators.length) {
    throw new Error("No ymlgen:generator config found");
  }
  return { generators, importedData, onSuccess, onFail, onDone };
};

const convertToString = (value: unknown) => {
  return typeof value === "undefined" || value === null ? "" : String(value);
};

const selectData = (data: any, path: string) => {
  if (!path) {
    return data;
  }
  return path.split(".").reduce((prev, p) => prev?.[p], data);
};

const processFile = async <T>(
  dataFile: string,
  fileName: string,
  content: string,
  getGenerator: (generatorName: string) => Promise<TextGenerator<T>>,
  writeFile: (fileName: string, content: string) => Promise<void>
) => {
  const { generators, importedData, onDone, onFail, onSuccess } = readConfigs(
    dirname(dataFile),
    content
  );

  let error: any;

  try {
    await Promise.all(
      generators.map(async (g): Promise<void> => {
        const isMultipleOutput = g.output.includes("**");
        const data = parse(content);

        if (!data) {
          // invalid data
          return;
        }

        const generator = await getGenerator(g.name);

        if (isMultipleOutput) {
          const privateData = {};
          const promises = Object.keys(data).map(async (key) => {
            const subData = data[key];
            // skip private key
            if (key[0] === "__") {
              Object.assign(privateData, { [key]: subData });
              return;
            }
            const selectedData = selectData(subData, g.select);
            Object.assign(selectedData, ...importedData, privateData);
            const [fileName, generatorName] = key.split(":");
            const customGenerator = generatorName
              ? await getGenerator(generatorName)
              : generator;
            const content = await generateText(
              dataFile,
              selectedData,
              customGenerator
            );
            await writeFile(g.output.replace("**", fileName), content);
          });
          await Promise.all(promises);
          return;
        }
        const selectedData = selectData(data, g.select);
        Object.assign(selectedData, ...importedData);
        const generatedText = await generateText(
          dataFile,
          selectedData,
          generator
        );
        await writeFile(g.output.replace("*", fileName), generatedText);
      })
    );
  } catch (ex) {
    error = ex;
  }

  return { onDone, onSuccess, onFail, error };
};

const generateText = async <T>(
  dataFile: string,
  data: unknown,
  generator: TextGenerator<T>
) => {
  const texts: string[] = [];
  const options: WriteOptions = {};
  const context: GenerationContext = createContext(
    dataFile,
    texts,
    data,
    options
  );
  await generator(context as any);
  return texts.join("");
};

const $use = <T>(data: unknown, generator: TextGenerator<T>) => {
  return (context: GenerationContext) => context.extends(data).write(generator);
};

const $each = <T>(
  data: unknown,
  generator: TextGenerator<T>,
  options: EachOptions<T> = {}
): TextGenerator<T> => {
  return async (context) => {
    if (!data) {
      throw new Error(
        `$each requires object or array for rendering but got ${typeof data} `
      );
    }
    let first = true;
    let alt = false;
    for (const [key, value] of Object.entries(data as any)) {
      if (first && options.start) {
        await context.extends(data, options.extra).write(options.start);
      }

      if (!first && options.sep) {
        await context
          .extends(value, { ...options.extra, key })
          .write(options.sep);
      }

      if (alt && options.alt) {
        await context
          .extends(value, { ...options.extra, key })
          .write(options.alt);
      } else {
        await context
          .extends(value, { ...options.extra, key })
          .write(generator);
      }
      alt = !alt;
      first = false;
    }

    if (first && options.end) {
      await context.extends(data, options.extra).write(options.end);
    }
  };
};

const createContext = (
  dataFile: string,
  texts: string[],
  data: unknown,
  options: WriteOptions,
  extraProps?: Record<string, unknown>
): GenerationContext => {
  const context = {
    key: undefined,
    ...extraProps,
    dataFile,
    texts,
    data,
    options,
    $each,
    $use,
    extends(newData: unknown, newExtraProps?: any) {
      return createContext(dataFile, texts, newData, options, {
        ...extraProps,
        ...newExtraProps,
      });
    },
    configure(newOptions: WriteOptions) {
      Object.assign(options, newOptions);
    },
    write(...args: any[]) {
      if (args.length) {
        return (async () => {
          for (const arg of args) {
            if (typeof arg === "function") {
              await arg(context);
            } else {
              texts.push(convertToString(arg));
            }
          }
        })();
      }
      return async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const copyOfStrings = strings.slice();
        const next = async () => {
          if (!copyOfStrings.length) {
            return;
          }
          texts.push(copyOfStrings.shift()!);
          if (!values.length) {
            return;
          }

          let text: string;
          const value = values.shift();
          if (typeof value === "function") {
            const result = await value(context);
            text = convertToString(result);
          } else {
            text = convertToString(value);
          }
          if (options.autoTrim === "all") {
            text = text.trim();
          }
          texts.push(text);
          await next();
        };

        await next();
      };
    },
  };

  return context;
};

export { processFile, isDataFile };
