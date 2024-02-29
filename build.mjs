import fs from 'fs/promises';

import typescript from 'typescript';
import esbuild from 'esbuild'

build()

async function build() {
  await fs.mkdir('dist', { recursive: true });
  const files = [
    'index',
    'sound-manager',
    'sound-promise'
  ]
  await Promise.all(files.map(one))
  fs.copyFile('src/index.html', 'dist/index.html')
}

async function one(file) {
  const promise = bundle(file)
  compile('index')
  return promise
}

/**
 * Creates the output directory and compiles the specified TypeScript files.
 * @parma {string} file - The name of the file to compile (without extension).
 */
async function bundle(file) {
  esbuild.buildSync({
    entryPoints: [`src/${file}.ts`],
    bundle: true,
    minify: true,
    outfile: `dist/${file}.min.js`,
    sourcemap: true,
    target: 'esnext',
    format: 'esm',
  })
}

/**
 * Compiles a TypeScript file to JavaScript including declaration files and source maps.
 * @param {string} name - The base name of the file to compile (without extension).
 */
function compile(name) {
  const infile = `src/${name}.ts`;
  const program = typescript.createProgram([infile], {
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    alwaysStrict: true,
    outDir: 'dist',
    declarationDir: 'dist',
    moduleResolution: typescript.ModuleResolutionKind.Bundler,
    target: typescript.ScriptTarget.ESNext,
    sourceRoot: "../src"
  });

  const result = program.emit();
  const diagnostics = typescript.getPreEmitDiagnostics(program).concat(result.diagnostics);
  const logs = diagnostics.map(diagnostic => {
    if (diagnostic.file) {
      const { line, character } = typescript.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
      const message = typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
    } else {
      return typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    }
  });
  logs.map(console.log);
  if (result.emitSkipped) {
    return 1
  } else {
    return 0
  }
}
