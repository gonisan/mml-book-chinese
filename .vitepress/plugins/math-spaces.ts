import type MarkdownIt from 'markdown-it'

/**
 * 本书的行内公式大量写成 `$ N_1,...,N_n $`（定界符内侧带空格），
 * 而 markdown-it 的数学插件只在 `$x$` 这种紧贴写法下才识别。
 * 这里在 block 解析之前把行内公式的定界符空格裁掉，源文件保持不动。
 *
 * 注意：`$$...$$`、围栏代码块、转义美元 `\$` 都不参与处理。
 */

const PLACEHOLDER_OPEN = '\uE000'
const PLACEHOLDER_CLOSE = '\uE001'

const DISPLAY_MATH = /\$\$[\s\S]*?\$\$/g
const FENCED_CODE = /^```[\s\S]*?^```/gm
const INLINE_MATH = /(?<!\\)\$([^$\n]+?)\$(?!\$)/g

/**
 * 表格单元格是行内上下文，`$$ ... $$` 在里面不会被块级规则接住，
 * 会原样漏出来。这里把表格行里的双美元公式降级成行内公式。
 */
function normalizeTableCells(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      if (!/^\s*\|/.test(line) || !line.includes('$$')) return line
      return line.replace(/\$\$\s*([^$]+?)\s*\$\$/g, (_, tex: string) => `$${tex.trim()}$`)
    })
    .join('\n')
}

function normalizeInlineSpacing(src: string): string {
  const stashed: string[] = []
  const hold = (chunk: string) => {
    stashed.push(chunk)
    return `${PLACEHOLDER_OPEN}${stashed.length - 1}${PLACEHOLDER_CLOSE}`
  }

  let out = src.replace(FENCED_CODE, hold)
  out = normalizeTableCells(out)
  out = out.replace(DISPLAY_MATH, hold)

  out = out.replace(INLINE_MATH, (match, inner: string) => {
    const tex = inner.trim()
    if (!tex) return match
    // 只有形如 $12.00$ 的金额才放过；单数字 $ 0 $ 是公式，必须归一化
    if (/^\d{1,3}(?:[.,]\d{3})*[.,]\d{2}$/.test(tex)) return match
    return `$${tex}$`
  })

  return out.replace(
    new RegExp(`${PLACEHOLDER_OPEN}(\\d+)${PLACEHOLDER_CLOSE}`, 'g'),
    (_, index: string) => stashed[Number(index)]
  )
}

export function mathSpaceNormalizer(md: MarkdownIt) {
  md.core.ruler.before('block', 'mml-math-space-normalizer', (state) => {
    state.src = normalizeInlineSpacing(state.src)
    return true
  })
}
