import fs from "fs";
import { dirname, resolve } from "path";

const createFileWriter =
  (
    workingDir: string,
    onSuccess?: (fullPath: string) => void,
    onError?: (error: unknown) => void
  ) =>
  async (fileName: string, content: string) => {
    try {
      const fullPath = resolve(workingDir, fileName);
      const dir = dirname(fullPath);
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
