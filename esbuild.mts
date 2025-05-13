import * as esbuild from 'esbuild'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as process from 'node:process'

const check = (...flags: string[]) => flags.some(flag => process.argv.includes(flag))
const watch = check('--watch', '-w')
const sourcemap = check('--sourcemap', '-s')
const minify = check('--minify', '-m')
const clean = check('--clean', '-c')

const development = check('--dev', '--development', '-d')
const production = check('--prod', '--production', '-p')

if (clean) {
  await fs.rm(path.join(import.meta.dirname, './out'), { force: true, recursive: true })
  console.log('Cleaned output directory')
}

const esbuildProblemMatcher: esbuild.Plugin = {
  name: 'esbuild-problem-matcher',
  setup: (build) => {
    build.onStart(() => {
      console.log('[watch] build started')
    })
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`)
        if (location == null) return
        console.error(`    ${location.file}:${location.line}:${location.column}:`)
      })
      console.log('[watch] build finished')
    })
  }
}

const options: esbuild.BuildOptions = {
  minify: minify || production,
  sourcemap: sourcemap || development,
  plugins: [esbuildProblemMatcher],
  bundle: true,
  outfile: 'out/entry.js',
  external: [ 'vscode' ],
  format: 'cjs',
  platform: 'node',
  logLevel: 'info',
  entryPoints: [ './src/entry.ts', ],
  tsconfig: './tsconfig.json',
}

if (watch) {
  const context = await esbuild.context(options)
  await context.watch()
} else {
  await esbuild.build(options)
}