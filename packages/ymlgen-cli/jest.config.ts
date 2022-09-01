import type { Config } from "@jest/types";
// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testEnvironment: "jsdom",
  testPathIgnorePatterns: ["__tests__/utils.ts", "dist/", "src/test/", "out/"],
};
export default config;
