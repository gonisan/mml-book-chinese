import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve('.vitepress/dist')

function walk(dir, filter, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, filter, acc)
    else if (filter(full)) acc.push(full)
  }
  return acc
}

if (!fs.existsSync(DIST)) {
  console.error('未找到 .vitepress/dist，请先执行 pnpm build')
  process.exit(1)
}

const pages = walk(DIST, (f) => f.endsWith('.html'))
let mathNodes = 0
let mathErrors = 0
let leftoverInline = 0
const brokenLinks = []
const missingImages = new Set()
const errorSamples = []

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8')
  const rel = path.relative(DIST, page)

  mathNodes += (html.match(/<mjx-container/g) ?? []).length

  const errs = (html.match(/data-mjx-error="[^"]*"/g) ?? [])
  if (errs.length) {
    mathErrors += errs.length
    if (errorSamples.length < 5) errorSamples.push(`${rel}: ${errs[0]}`)
  }

  // 没被插件吃掉的 `$ x $` 会留下 "$ 空格 + 字母/反斜杠" 的痕迹
  leftoverInline += (html.match(/\$ [A-Za-z\\{]/g) ?? []).length

  for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
    const target = m[1]
    if (target.startsWith('//')) continue
    const candidate = path.join(DIST, target)
    const exists =
      fs.existsSync(candidate) ||
      fs.existsSync(`${candidate}.html`) ||
      fs.existsSync(path.join(candidate, 'index.html'))
    if (!exists) {
      if (/\.(png|jpe?g|svg|gif|webp)$/i.test(target)) missingImages.add(target)
      else if (!target.startsWith('/assets/')) brokenLinks.push(`${rel} -> ${target}`)
    }
  }
}

const uniqueMissing = [...missingImages]
console.log(`页面数            ${pages.length}`)
console.log(`公式节点          ${mathNodes}`)
console.log(`公式渲染错误      ${mathErrors}`)
console.log(`未渲染的行内公式  ${leftoverInline}`)
console.log(`缺失图片          ${uniqueMissing.length}`)
console.log(`站内死链          ${brokenLinks.length}`)

if (errorSamples.length) {
  console.log('\n公式错误样例：')
  for (const s of errorSamples) console.log(`  ${s}`)
}
if (uniqueMissing.length) {
  console.log('\n缺失图片：')
  for (const s of uniqueMissing.slice(0, 10)) console.log(`  ${s}`)
}
if (brokenLinks.length) {
  console.log('\n死链：')
  for (const s of brokenLinks.slice(0, 10)) console.log(`  ${s}`)
}
