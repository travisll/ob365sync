import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const banner =
  "/* eslint-disable */\n" +
  "const global = globalThis;\n" +
  "const process = require('process');\n" +
  "const Buffer = require('buffer').Buffer;\n";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  banner: {
    js: banner,
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
