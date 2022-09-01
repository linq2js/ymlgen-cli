import { TextGenerator } from "./generator";
import path from "path";

const createGeneratorResolver = (generatorDir: string) => {
  const resolved = new Map<string, any>();

  const resolveGenerator = <T>(path: string) => {
    const resolvedPath = require.resolve(path);
    let result = resolved.get(resolvedPath);
    if (result) {
      return result as T;
    }
    delete require.cache[resolvedPath];
    result = require(path);
    resolved.set(resolvedPath, result);
    return result as T;
  };

  const findGenerator = async (
    generatorName: string
  ): Promise<TextGenerator<any>> => {
    const generatorPath = path.resolve(generatorDir, `${generatorName}.js`);

    return resolveGenerator<TextGenerator<any>>(generatorPath);
  };

  return findGenerator;
};

export { createGeneratorResolver };
