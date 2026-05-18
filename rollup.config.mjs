import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";
import path from "node:path";
import url from "node:url";

const isProduction = process.env.BUILD === "production";
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * @type {import("rollup").RollupOptions}
 */
const config = {
  input: "src/plugin.ts",
  output: {
    file: "com.easyprompter.streamdeck.sdPlugin/bin/plugin.js",
    format: "es",
    sourcemap: !isProduction,
    sourcemapPathTransform: (relativeSourcePath) => {
      return url.pathToFileURL(path.resolve(__dirname, relativeSourcePath))
        .href;
    },
  },
  plugins: [
    json(),
    typescript({
      mapRoot: isProduction ? "./" : undefined,
    }),
    resolve({
      browser: false,
      exportConditions: ["node"],
    }),
  ],
};

export default config;
