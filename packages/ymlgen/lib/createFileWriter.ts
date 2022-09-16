import fs from "fs";
import { dirname, resolve } from "path";

export type WriteFileOptions = {
  skipIfExist?: boolean;
};

const createFileWriter =
  (
    workingDir: string,
    onSuccess?: (fullPath: string) => void,
    onError?: (error: unknown) => void
  ) =>
  async (
    fileName: string,
    content: string,
    { skipIfExist }: WriteFileOptions = {}
  ) => {
    try {
      const fullPath = resolve(workingDir, fileName);
      const dir = dirname(fullPath);
      if (skipIfExist && fs.existsSync(fullPath)) {
        return;
      }
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
      fs.writeFileSync(fullPath, content);
      onSuccess?.(fullPath);
    } catch (ex) {
      onError?.(ex);
    }
  };

export { createFileWriter };
