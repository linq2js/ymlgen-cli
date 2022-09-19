#!/usr/bin/env node

import chalk from "chalk";
import clear from "clear";
import figlet from "figlet";
import { program } from "commander";
import glob from "glob";
import path from "path";
import fs from "fs";
import {
  isDataFile,
  processFile,
  createGeneratorResolver,
  createFileWriter,
} from "ymlgen";

type Options = {
  c: string;
};

const packageInfo = require("../package.json");

clear();

console.log(
  chalk.red(figlet.textSync(packageInfo.name, { horizontalLayout: "full" }))
);

const main = async () => {
  await program
    .version(packageInfo.version)
    .description("An example CLI for ordering pizza's")
    .argument("<pattern>", "A glob pattern for yaml data files")
    .option("-c, --config-dir", "Config directory")
    .action(
      async (
        pattern: string,
        { c: configDir = path.resolve(process.cwd(), ".ymlgen") }: Options
      ) => {
        return new Promise((resolve, reject) => {
          glob(pattern, async (error, files) => {
            if (error) {
              console.error(error);
              return;
            }
            const resolver = createGeneratorResolver(
              path.resolve(configDir, "generators")
            );
            let hasError = false;

            await Promise.all(
              files.map(async (file) => {
                try {
                  const ext = path.extname(file);
                  const content = fs.readFileSync(file, "utf-8");

                  if (!isDataFile(content)) {
                    return;
                  }

                  if (!require.main) {
                    console.log(chalk.cyan("No package.json found"));
                    return;
                  }

                  const projectRoot = path.dirname(require.main.path);

                  await processFile({
                    generatorWorkspaceDir: path.resolve(
                      projectRoot,
                      "./ymlgen"
                    ),
                    dataFileWorkspaceDir: projectRoot,
                    dataFile: file,
                    fileName: path.basename(file, ext),
                    content,
                    getGenerator: resolver,
                    writeFile: createFileWriter(
                      path.dirname(file),
                      (generatedFile) =>
                        console.log(
                          chalk.green(
                            `The output file is generated successfully: ${generatedFile}`
                          )
                        )
                    ),
                    includeFileReader: () => ({}),
                  });
                } catch (ex) {
                  console.log(file, chalk.red(ex));
                  hasError = true;
                }
              })
            );

            if (hasError) {
              process.exit(1);
            }
          })
            .on("error", reject)
            .on("end", resolve);
        });
      }
    )
    .parseAsync(process.argv);

  // show help if no arg
  if (!program.args.length) {
    program.outputHelp();
  }
};

main();
