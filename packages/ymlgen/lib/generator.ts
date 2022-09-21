import { parse } from "yamljs";
import { resolve, extname } from "path";
import * as fs from "fs";
import { merge } from "lodash";
export type AutoTrim = "start-end" | "all" | boolean;

export type WriteOptions = StringConvertionOptions & { autoTrim?: AutoTrim };

export type TemplateConfigs = { output: string; generator: string };

export type ConfigResolver = (config: string, value: string) => boolean;

export type IncludeFileReader = (dataDir: string, name: string) => {};

export type GeneratorFactory<T> = (
  generatorName: string
) => Promise<TextGenerator<T>>;

export type ProcessFileOptions<T> = {
  generatorWorkspaceDir: string;
  dataFileWorkspaceDir: string;
  dataFile: string;
  fileName: string;
  content: string;
  getGenerator: GeneratorFactory<T>;
  writeFile: (fileName: string, content: string) => Promise<void>;
  configResolver?: ConfigResolver;
  includeFileReader?: IncludeFileReader;
};

export type GenerationContext = {
  readonly dataFile: string;
  readonly texts: string[];
  readonly options: WriteOptions;
  readonly data: any;
  readonly rawData: any;
  readonly key: any;
  $each: typeof $each;
  $use: typeof $use;
  extends(data: unknown, extraProps?: unknown): GenerationContext;
  write(...values: any[]): any;
  configure(options: WriteOptions): void;
  extra(values: Record<string, any>): void;
};

export type EachOptions<T> = {
  sep?: TextGenerator<T> | string;
  start?: TextGenerator<T> | string;
  end?: TextGenerator<T> | string;
  alt?: TextGenerator<T> | string;
  extra?: any;
};

export type TextGenerator<TExtra> = (
  context: GenerationContext & TExtra
) => void | Promise<void>;

export type StringConvertionOptions = {};

const isDataFile = (content: string) => {
  return content.trimStart().startsWith("# ymlgen");
};

const defaultIncludeFileReader: IncludeFileReader = (
  dataDir: string,
  name: string
) => {
  const importFilePath = resolve(dataDir, name);
  const importFileContent = fs.readFileSync(importFilePath, "utf-8");
  const importExt = (extname(name) ?? "").toLowerCase();
  const data = importExt.endsWith(".json")
    ? // support JSON file
      JSON.parse(importFileContent)
    : // unless using yaml parser
      parse(importFileContent);
  return data;
};

const readConfigs = (
  dataDir: string,
  content: string,
  configResolver?: ConfigResolver,
  includeFileReader = defaultIncludeFileReader
) => {
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
      case "merge":
        if (!includeFileReader) return "";
        const data = includeFileReader(dataDir, value);
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
        if (!configResolver?.(name, value)) {
          throw new Error(`Invalid config ${name}`);
        }
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

const processFile = async <T>({
  generatorWorkspaceDir,
  dataFileWorkspaceDir: _,
  dataFile,
  content,
  configResolver,
  includeFileReader,
  getGenerator,
  fileName,
  writeFile,
}: ProcessFileOptions<T>) => {
  const { generators, importedData, onDone, onFail, onSuccess } = readConfigs(
    resolve(generatorWorkspaceDir, "data"),
    content,
    configResolver,
    includeFileReader
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
            const finalData = merge(
              {},
              ...importedData,
              privateData,
              selectedData
            );
            const [fileName, generatorName] = key.split(":");
            const customGenerator = generatorName
              ? await getGenerator(generatorName)
              : generator;
            const content = await generateText(
              dataFile,
              finalData,
              selectedData,
              customGenerator
            );
            await writeFile(g.output.replace("**", fileName), content);
          });
          await Promise.all(promises);
          return;
        }
        const selectedData = selectData(data, g.select);
        const finalData = merge({}, ...importedData, selectedData);
        const generatedText = await generateText(
          dataFile,
          finalData,
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
  rawData: unknown,
  generator: TextGenerator<T>
) => {
  const texts: string[] = [];
  const options: WriteOptions = {};
  const context: GenerationContext = createContext(
    dataFile,
    texts,
    data,
    rawData,
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
  rawData: unknown,
  options: WriteOptions,
  extraProps?: Record<string, unknown>
): GenerationContext => {
  const context = {
    key: undefined,
    ...extraProps,
    dataFile,
    texts,
    data,
    rawData,
    options,
    $each,
    $use,
    extra(values: Record<string, any>) {
      extraProps = Object.assign({}, extraProps, values);
    },
    extends(newData: unknown, newExtraProps?: any) {
      return createContext(dataFile, texts, newData, rawData, options, {
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

export { processFile, isDataFile, defaultIncludeFileReader };
