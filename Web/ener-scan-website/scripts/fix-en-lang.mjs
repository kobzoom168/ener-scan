// หลัง build: หน้า /en/** ต้องประกาศ lang="en" (WCAG 3.1.1) — root layout ตั้ง th ไว้ทั้งเว็บ
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'out', 'en')
let fixed = 0

function walk(d) {
  let entries
  try {
    entries = readdirSync(d)
  } catch {
    return
  }
  for (const name of entries) {
    const p = join(d, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.html')) {
      const src = readFileSync(p, 'utf-8')
      const out = src.replace('<html lang="th"', '<html lang="en"')
      if (out !== src) {
        writeFileSync(p, out)
        fixed++
      }
    }
  }
}

walk(dir)
console.log(`fix-en-lang: ${fixed} files updated`)
