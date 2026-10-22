import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 仓库根目录（Markdown 源文件所在位置，也是 VitePress 的 srcDir） */
export const ROOT = path.resolve(HERE, '../..')

/** 根目录下零散页面的固定路由，避免 URL 里出现 "0.Foreword" 这类前缀 */
const ROOT_PAGE_SLUGS: Record<string, string> = {
  '0.Foreword.md': 'foreword.md',
  '3.References.md': 'references.md',
  '4.Index.md': 'terms-index.md'
}

const PART_TITLES: Record<number, string> = {
  1: '第一部分 · 数学基础',
  2: '第二部分 · 机器学习核心问题'
}

export interface PageEntry {
  /** 相对仓库根的源文件路径（posix） */
  src: string
  /** 重写后的输出路径（posix），用于 rewrites */
  out: string
  /** 站内路由（cleanUrls） */
  route: string
  /** 页面首个标题 */
  title: string
  /** 侧边栏显示名 */
  navTitle: string
}

export interface Chapter {
  num: number
  title: string
  pages: PageEntry[]
}

export interface Part {
  num: number
  title: string
  chapters: Chapter[]
}

export interface Book {
  front: PageEntry[]
  parts: Part[]
  back: PageEntry[]
  pages: PageEntry[]
}

function kebab(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '') || 'page'
}

/** 拆解 "2.1SystemsOfLinearEquations" -> { major: 2, minor: 1, rest: "SystemsOfLinearEquations" } */
function splitNumber(base: string) {
  const m = /^(\d+)(?:\.(\d+))?\.?(.*)$/.exec(base)
  if (!m) return { major: null as number | null, minor: null as number | null, rest: base }
  return {
    major: Number(m[1]),
    minor: m[2] ? Number(m[2]) : null,
    rest: m[3] || base
  }
}

/** 取文件前若干行的第一个标题，作为页面标题 */
function firstHeading(file: string): string {
  const head = fs.readFileSync(file, 'utf8').split('\n', 24)
  for (const line of head) {
    const m = /^#{1,4}\s+(.+?)\s*$/.exec(line)
    if (m) return m[1].replace(/\s+/g, ' ').trim()
  }
  return path.basename(file, '.md')
}

function routeOf(out: string): string {
  const noExt = out.replace(/\.md$/, '')
  if (noExt === 'index') return '/'
  if (noExt.endsWith('/index')) return `/${noExt.slice(0, -'index'.length)}`
  return `/${noExt}`
}

function makePage(srcAbs: string, srcRel: string, out: string, navTitle?: string): PageEntry {
  const title = firstHeading(srcAbs)
  return {
    src: srcRel,
    out,
    route: routeOf(out),
    title,
    navTitle: navTitle ?? title
  }
}

function listDirs(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function listMarkdown(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name)
}

function sortWeight(fileBase: string): number {
  const { minor } = splitNumber(fileBase)
  if (minor === 0) return -10
  if (/^Exercises/i.test(fileBase)) return 9000
  if (/^FurtherReading/i.test(fileBase)) return 8000
  return minor ?? 5000
}

function readChapter(partNum: number, dirName: string, chapterDir: string): Chapter {
  const num = Number(dirName)
  const files = listMarkdown(chapterDir).sort((a, b) => {
    const diff = sortWeight(path.basename(a, '.md')) - sortWeight(path.basename(b, '.md'))
    return diff !== 0 ? diff : a.localeCompare(b)
  })

  const parsed = files.map((name) => {
    const base = path.basename(name, '.md')
    return { name, base, ...splitNumber(base) }
  })

  const overview = parsed.find((p) => p.minor === 0)
  const single = parsed.length === 1 ? parsed[0] : undefined
  const slugSource = (overview ?? single)?.rest ?? `chapter-${num}`
  const chapterSlug = `${String(num).padStart(2, '0')}-${kebab(slugSource)}`
  const prefix = `part${partNum}/${chapterSlug}`

  const pages = parsed.map((p) => {
    const srcRel = path.posix.join(
      path.basename(path.dirname(chapterDir)),
      dirName,
      p.name
    )
    const srcAbs = path.join(chapterDir, p.name)

    if (p.minor === 0 || (!overview && single)) {
      return makePage(srcAbs, srcRel, `${prefix}/index.md`, '概览')
    }
    if (/^Exercises/i.test(p.base)) {
      return makePage(srcAbs, srcRel, `${prefix}/exercises.md`, '练习')
    }
    const slug = p.minor === null
      ? kebab(p.rest)
      : `${num}-${p.minor}-${kebab(p.rest)}`
    return makePage(srcAbs, srcRel, `${prefix}/${slug}.md`)
  })

  const title = pages[0]?.title ?? `第 ${num} 章`

  return { num, title, pages }
}

function readRootPage(fileName: string): PageEntry {
  const out = ROOT_PAGE_SLUGS[fileName] ?? `${kebab(path.basename(fileName, '.md'))}.md`
  return makePage(path.join(ROOT, fileName), fileName, out)
}

let cached: Book | null = null

export function readBook(): Book {
  if (cached) return cached

  const entries = fs.readdirSync(ROOT, { withFileTypes: true })
  const partDirs = entries
    .filter((d) => d.isDirectory() && /^\d+\.Part\b/.test(d.name))
    .map((d) => d.name)
    .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))

  const parts: Part[] = partDirs.map((partDir) => {
    const num = Number(partDir.split('.')[0])
    const partAbs = path.join(ROOT, partDir)
    const chapterDirs = listDirs(partAbs)
      .filter((d) => /^\d+$/.test(d))
      .sort((a, b) => Number(a) - Number(b))

    return {
      num,
      title: PART_TITLES[num] ?? partDir.replace(/^\d+\./, ''),
      chapters: chapterDirs.map((d) => readChapter(num, d, path.join(partAbs, d)))
    }
  })

  const front = ['0.Foreword.md'].map(readRootPage)
  const back = ['3.References.md', '4.Index.md'].map(readRootPage)

  const allPages = [...front, ...parts.flatMap((p) => p.chapters.flatMap((c) => c.pages)), ...back]
  const seen = new Map<string, string>()
  for (const page of allPages) {
    const prev = seen.get(page.out)
    if (prev) throw new Error(`路由冲突：${prev} 与 ${page.src} 都映射到 ${page.out}`)
    seen.set(page.out, page.src)
  }

  cached = { front, parts, back, pages: allPages }
  return cached
}

export function toRewrites(book: Book = readBook()): Record<string, string> {
  return Object.fromEntries(book.pages.map((p) => [p.src, p.out]))
}

export function buildSidebar(book: Book = readBook()) {
  return [
    { text: '开始', items: book.front.map((p) => ({ text: p.title, link: p.route })) },
    ...book.parts.map((part) => ({
      text: part.title,
      collapsed: false,
      items: part.chapters.map((chapter) => ({
        text: `${chapter.num} ${chapter.title}`,
        collapsed: true,
        items: chapter.pages.map((p) => ({ text: p.navTitle, link: p.route }))
      }))
    })),
    { text: '附录', items: book.back.map((p) => ({ text: p.title, link: p.route })) }
  ]
}

export function buildNav(book: Book = readBook()) {
  return [
    { text: '首页', link: '/' },
    ...book.parts.map((part) => ({
      text: part.title.replace(' · ', ' '),
      items: part.chapters.map((chapter) => ({
        text: `${chapter.num} ${chapter.title}`,
        link: chapter.pages[0].route
      }))
    })),
    {
      text: '附录',
      items: book.back.map((p) => ({ text: p.title, link: p.route }))
    }
  ]
}
