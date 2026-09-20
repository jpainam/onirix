"use client"

/**
 * A workbook drawn the way a spreadsheet program draws it: lettered columns,
 * numbered rows, the fills, fonts and number formats the author chose, a bar
 * that shows what is behind the selected cell, and a tab per sheet.
 *
 * SheetJS reads the values, because it opens nearly anything: old `.xls`
 * files, and workbooks from writers that namespace every tag, which stricter
 * readers reject outright. Its open build keeps fills and nothing else of a
 * cell's look, so the fonts, borders, alignment and table styles are read
 * here from the workbook's own parts.
 *
 * The grid is white in both themes, like the page of a document. A workbook
 * carries its own colours, and they were picked against white.
 */
import * as React from "react"
import { cn } from "cn"
import type { CellObject, WorkBook, WorkSheet } from "xlsx"

/** Beyond this the grid stops, and says so: every cell here is a DOM node. */
const MAX_ROWS = 1000
const MAX_COLUMNS = 60
/** A sheet is never drawn smaller than this, so a short one still reads as a grid. */
const MIN_ROWS = 30
const MIN_COLUMNS = 8
const DEFAULT_COLUMN_WIDTH = 72
/** A sheet part larger than this is drawn without its styles rather than parsed twice. */
const MAX_STYLED_PART_BYTES = 8 * 1024 * 1024

type SheetCell = {
  text: string
  /** What the bar above the grid shows: the formula if there is one. */
  raw: string
  style?: React.CSSProperties
  colSpan?: number
  rowSpan?: number
  /** Under a merged neighbour, so not drawn. */
  covered?: boolean
}

export type Sheet = {
  name: string
  /** Column widths in pixels. */
  widths: number[]
  heights: (number | undefined)[]
  rows: (SheetCell | undefined)[][]
  truncated: boolean
}

/** 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
  let name = ""
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

/** `B12` → { row: 11, column: 1 }. */
function decodeAddress(address: string): { row: number; column: number } | null {
  const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(address)
  if (!match) return null
  let column = 0
  for (const letter of match[1]!) column = column * 26 + (letter.charCodeAt(0) - 64)
  return { row: Number(match[2]) - 1, column: column - 1 }
}

/** One number per cell, for maps that would otherwise be keyed by string. */
const cellKey = (row: number, column: number) => row * 16_384 + column

// ---------------------------------------------------------------------------
// The look of a cell, read from the workbook's own parts.
// ---------------------------------------------------------------------------

/**
 * What one cell format comes to in CSS. Top and left borders are kept apart:
 * cells share their edges and the grid only draws right and bottom ones, so
 * those two are handed to the neighbour on that side.
 */
type Look = { css: React.CSSProperties; top?: string; left?: string }

type Table = {
  top: number
  left: number
  bottom: number
  right: number
  header: boolean
  stripes: boolean
  accent: string
}

type SheetLooks = { cells: Map<number, Look>; tables: Table[] }

// The Office theme, for a workbook that does not carry one.
const DEFAULT_THEME = [
  "FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31",
  "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72",
]

function tint(hex: string, amount: number): string {
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16)
    const tinted = amount < 0 ? value * (1 + amount) : value + (255 - value) * amount
    return Math.round(tinted).toString(16).padStart(2, "0")
  })
  return `#${channels.join("")}`
}

/** Tags are matched by local name, so a writer's choice of prefix never matters. */
const children = (parent: Element | Document, name: string) =>
  Array.from(parent.getElementsByTagNameNS("*", name))

const child = (parent: Element, name: string): Element | undefined =>
  Array.from(parent.children).find((element) => element.localName === name)

/** `<b/>` is on, `<b val="0"/>` is off, no tag is off. */
const flag = (parent: Element, name: string) => {
  const element = child(parent, name)
  return element !== undefined && element.getAttribute("val") !== "0"
}

function readColor(element: Element | undefined, theme: string[]): string | undefined {
  if (!element) return undefined
  const rgb = element.getAttribute("rgb")
  if (rgb) return `#${rgb.slice(-6)}`
  const slot = element.getAttribute("theme")
  if (slot === null) return undefined
  const base = theme[Number(slot)]
  return base ? tint(base, Number(element.getAttribute("tint") ?? 0)) : undefined
}

function readBorder(edge: Element | undefined, theme: string[]): string | undefined {
  const style = edge?.getAttribute("style")
  if (!edge || !style || style === "none") return undefined
  const heavy = style === "medium" || style === "thick" || style === "double"
  return `${heavy ? 2 : 1}px solid ${readColor(child(edge, "color"), theme) ?? "#000000"}`
}

/** The theme's colours in the order a workbook indexes them. */
function readTheme(document: Document | undefined): string[] {
  const scheme = document ? children(document, "clrScheme")[0] : undefined
  if (!scheme) return DEFAULT_THEME
  const colors = Array.from(scheme.children).map((slot) => {
    const color = slot.firstElementChild
    return color?.getAttribute("val") ?? color?.getAttribute("lastClr") ?? "000000"
  })
  // The file lists dark before light; a workbook counts light first.
  const [dark1, light1, dark2, light2, ...rest] = colors
  if (!dark1 || !light1 || !dark2 || !light2) return DEFAULT_THEME
  return [light1, dark1, light2, dark2, ...rest]
}

/** One `Look` per cell format, in the order cells refer to them. */
function readFormats(document: Document, theme: string[]): Look[] {
  const list = (name: string) => {
    const parent = children(document, name)[0]
    return parent ? Array.from(parent.children) : []
  }
  const fonts = list("fonts")
  const fills = list("fills")
  const borders = list("borders")

  return list("cellXfs").map((format) => {
    const css: React.CSSProperties = {}
    const look: Look = { css }

    const font = fonts[Number(format.getAttribute("fontId") ?? 0)]
    if (font) {
      if (flag(font, "b")) css.fontWeight = 600
      if (flag(font, "i")) css.fontStyle = "italic"
      const lines = [flag(font, "u") && "underline", flag(font, "strike") && "line-through"]
      if (lines.some(Boolean)) css.textDecoration = lines.filter(Boolean).join(" ")
      const ink = readColor(child(font, "color"), theme)
      if (ink) css.color = ink
    }

    const pattern = fills[Number(format.getAttribute("fillId") ?? 0)]?.firstElementChild
    if (pattern?.getAttribute("patternType") === "solid") {
      const paint = readColor(child(pattern, "fgColor"), theme)
      if (paint) css.backgroundColor = paint
    }

    const border = borders[Number(format.getAttribute("borderId") ?? 0)]
    if (border) {
      const right = readBorder(child(border, "right") ?? child(border, "end"), theme)
      const bottom = readBorder(child(border, "bottom"), theme)
      if (right) css.borderRight = right
      if (bottom) css.borderBottom = bottom
      look.top = readBorder(child(border, "top"), theme)
      look.left = readBorder(child(border, "left") ?? child(border, "start"), theme)
    }

    const alignment = child(format, "alignment")
    const horizontal = alignment?.getAttribute("horizontal")
    if (horizontal === "center" || horizontal === "right" || horizontal === "left") {
      css.textAlign = horizontal
    }
    const vertical = alignment?.getAttribute("vertical")
    if (vertical === "top") css.verticalAlign = "top"
    if (vertical === "center") css.verticalAlign = "middle"
    if (alignment?.getAttribute("wrapText") === "1") css.whiteSpace = "pre-wrap"

    return look
  })
}

/** `xl/worksheets/sheet1.xml` + `../tables/table1.xml` → `xl/tables/table1.xml`. */
function resolveTarget(from: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1)
  const parts = from.split("/").slice(0, -1)
  for (const part of target.split("/")) {
    if (part === "..") parts.pop()
    else if (part !== ".") parts.push(part)
  }
  return parts.join("/")
}

const relationshipsOf = (part: string) => {
  const slash = part.lastIndexOf("/")
  return `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`
}

/**
 * A table's built-in style, reduced to what makes it recognisable: a header in
 * the style's accent and, when asked for, banded rows in a tint of it. The
 * sixty built-in styles differ in more than that, but this is the part a
 * reader notices.
 */
function readTable(document: Document, theme: string[]): Table | null {
  const table = document.documentElement
  const [from, to = from] = (table.getAttribute("ref") ?? "").split(":")
  const start = from ? decodeAddress(from) : null
  const end = to ? decodeAddress(to) : null
  const info = children(document, "tableStyleInfo")[0]
  const style = /^TableStyle(?:Light|Medium|Dark)(\d+)$/.exec(info?.getAttribute("name") ?? "")
  if (!start || !end || !style) return null

  // The built-in styles cycle through neutral, then the six accents.
  const slot = (Number(style[1]) - 1) % 7
  return {
    top: start.row,
    left: start.column,
    bottom: end.row,
    right: end.column,
    header: table.getAttribute("headerRowCount") !== "0",
    stripes: info?.getAttribute("showRowStripes") === "1",
    accent: slot === 0 ? "595959" : (theme[3 + slot] ?? DEFAULT_THEME[3 + slot]!),
  }
}

function tableLook(tables: Table[], row: number, column: number): React.CSSProperties | undefined {
  for (const table of tables) {
    if (row < table.top || row > table.bottom || column < table.left || column > table.right) {
      continue
    }
    if (table.header && row === table.top) {
      return { backgroundColor: `#${table.accent}`, color: "#ffffff", fontWeight: 600 }
    }
    const band = row - table.top - (table.header ? 1 : 0)
    return table.stripes && band % 2 === 0
      ? { backgroundColor: tint(table.accent, 0.8) }
      : undefined
  }
  return undefined
}

type PackageFiles = Record<string, { content?: Uint8Array } | undefined>

/** The look of every sheet, by the relationship id SheetJS reports for it. */
function readLooks(workbook: WorkBook): Map<string, SheetLooks> {
  const looks = new Map<string, SheetLooks>()
  const files = (workbook as WorkBook & { files?: PackageFiles }).files
  // Only a zipped workbook has parts to read. An `.xls` has none.
  if (!files || typeof DOMParser === "undefined") return looks

  const decoder = new TextDecoder()
  const parse = (path: string, limit = Number.POSITIVE_INFINITY): Document | undefined => {
    const content = files[path]?.content
    if (!content || content.byteLength > limit) return undefined
    const document = new DOMParser().parseFromString(decoder.decode(content), "application/xml")
    return document.getElementsByTagName("parsererror").length > 0 ? undefined : document
  }

  const stylesPath = Object.keys(files).find((path) => /^xl\/styles\d*\.xml$/i.test(path))
  const themePath = Object.keys(files).find((path) => /^xl\/theme\/[^/]+\.xml$/i.test(path))
  const styles = stylesPath ? parse(stylesPath) : undefined
  const theme = readTheme(themePath ? parse(themePath) : undefined)
  const formats = styles ? readFormats(styles, theme) : []

  const workbookPath = "xl/workbook.xml"
  const relationships = parse(relationshipsOf(workbookPath))
  if (!relationships) return looks

  for (const relationship of children(relationships, "Relationship")) {
    if (!relationship.getAttribute("Type")?.endsWith("/worksheet")) continue
    const id = relationship.getAttribute("Id")
    const target = relationship.getAttribute("Target")
    if (!id || !target) continue

    const sheetPath = resolveTarget(workbookPath, target)
    const cells = new Map<number, Look>()
    const sheet = parse(sheetPath, MAX_STYLED_PART_BYTES)
    for (const row of sheet ? children(sheet, "row").slice(0, MAX_ROWS) : []) {
      for (const cell of Array.from(row.children)) {
        const look = formats[Number(cell.getAttribute("s") ?? 0)]
        const at = decodeAddress(cell.getAttribute("r") ?? "")
        if (look && at && at.column < MAX_COLUMNS) cells.set(cellKey(at.row, at.column), look)
      }
    }

    const tables: Table[] = []
    const sheetRelationships = parse(relationshipsOf(sheetPath))
    for (const entry of sheetRelationships ? children(sheetRelationships, "Relationship") : []) {
      if (!entry.getAttribute("Type")?.endsWith("/table")) continue
      const tableDocument = parse(resolveTarget(sheetPath, entry.getAttribute("Target") ?? ""))
      const table = tableDocument ? readTable(tableDocument, theme) : null
      if (table) tables.push(table)
    }

    looks.set(id, { cells, tables })
  }
  return looks
}

// ---------------------------------------------------------------------------
// The grid's model.
// ---------------------------------------------------------------------------

/** Dark enough that black text on it would not read. */
function isDark(hex: string): boolean {
  const [red, green, blue] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
  return 0.299 * red! + 0.587 * green! + 0.114 * blue! < 140
}

function readWorksheet(
  name: string,
  worksheet: WorkSheet,
  looks: SheetLooks | undefined,
  decodeRange: (range: string) => { e: { r: number; c: number } },
): Sheet {
  const data = (worksheet["!data"] ?? []) as (CellObject | undefined)[][]
  // `!fullref` is only there when the read was cut short, which is the point.
  const full = decodeRange(worksheet["!fullref"] ?? worksheet["!ref"] ?? "A1").e
  const rowCount = Math.min(full.r + 1, MAX_ROWS)
  const columnCount = Math.min(full.c + 1, MAX_COLUMNS)

  const spans = new Map<number, { colSpan: number; rowSpan: number }>()
  const covered = new Set<number>()
  for (const merge of worksheet["!merges"] ?? []) {
    // A merge that runs past the cap is cut where the grid is.
    const bottom = Math.min(merge.e.r, rowCount - 1)
    const right = Math.min(merge.e.c, columnCount - 1)
    spans.set(cellKey(merge.s.r, merge.s.c), {
      colSpan: right - merge.s.c + 1,
      rowSpan: bottom - merge.s.r + 1,
    })
    for (let r = merge.s.r; r <= bottom; r++) {
      for (let c = merge.s.c; c <= right; c++) {
        if (r !== merge.s.r || c !== merge.s.c) covered.add(cellKey(r, c))
      }
    }
  }

  const rows: Sheet["rows"] = []
  for (let r = 0; r < rowCount; r++) {
    const row: (SheetCell | undefined)[] = []
    for (let c = 0; c < columnCount; c++) {
      const key = cellKey(r, c)
      if (covered.has(key)) {
        row.push({ text: "", raw: "", covered: true })
        continue
      }

      const cell = data[r]?.[c]
      const look = looks?.cells.get(key)
      const banding = looks ? tableLook(looks.tables, r, c) : undefined
      if (!cell && !look && !banding) {
        row.push(undefined)
        continue
      }

      // A cell's own format wins over the table it sits in.
      const style: React.CSSProperties = { ...banding, ...look?.css }
      if (!looks) {
        // No parts to read, so the fill is all there is. Ink is chosen to be
        // legible on it, since the font's own colour is not known.
        const fill = cell?.s as { patternType?: string; fgColor?: { rgb?: string } } | undefined
        if (fill?.patternType === "solid" && fill.fgColor?.rgb) {
          style.backgroundColor = `#${fill.fgColor.rgb}`
          if (isDark(style.backgroundColor)) style.color = "#ffffff"
        }
      }
      // Unaligned cells follow the program's own habit: numbers and dates sit
      // right, booleans and errors centre, text sits left.
      if (!style.textAlign) {
        if (cell?.t === "n" || cell?.t === "d") style.textAlign = "right"
        else if (cell?.t === "b" || cell?.t === "e") style.textAlign = "center"
      }

      const value = cell && cell.t !== "z" ? String(cell.v ?? "") : ""
      row.push({
        text: cell?.w ?? value,
        raw: cell?.f ? `=${cell.f}` : value,
        style,
        ...spans.get(key),
      })

      if (look?.top && r > 0) {
        const above = (rows[r - 1]![c] ??= { text: "", raw: "" })
        above.style = { ...above.style, borderBottom: above.style?.borderBottom ?? look.top }
      }
      if (look?.left && c > 0) {
        const before = (row[c - 1] ??= { text: "", raw: "" })
        before.style = { ...before.style, borderRight: before.style?.borderRight ?? look.left }
      }
    }
    rows.push(row)
  }

  return {
    name,
    widths: Array.from({ length: columnCount }, (_, c) => {
      const width = worksheet["!cols"]?.[c]?.wpx
      return width ? Math.min(480, Math.max(24, Math.round(width))) : DEFAULT_COLUMN_WIDTH
    }),
    heights: Array.from({ length: rowCount }, (_, r) => {
      const height = worksheet["!rows"]?.[r]?.hpx
      return height ? Math.round(height) : undefined
    }),
    rows,
    truncated: full.r + 1 > MAX_ROWS || full.c + 1 > MAX_COLUMNS,
  }
}

export async function readWorkbook(data: ArrayBuffer): Promise<Sheet[]> {
  // Large, and only a spreadsheet needs it.
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(data, {
    dense: true,
    cellStyles: true,
    bookFiles: true,
    // One past the cap, so a sheet that was cut short can say so.
    sheetRows: MAX_ROWS + 1,
  })
  const looks = readLooks(workbook)

  return workbook.SheetNames.flatMap((name, index) => {
    const worksheet = workbook.Sheets[name]
    const entry = workbook.Workbook?.Sheets?.[index] as { Hidden?: number; id?: string } | undefined
    if (!worksheet || entry?.Hidden) return []
    return [
      readWorksheet(name, worksheet, entry?.id ? looks.get(entry.id) : undefined, XLSX.utils.decode_range),
    ]
  })
}

/** Whichever of the usual separators the first line leans on. */
function sniffDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0)
  let best = ","
  let bestCount = 0
  for (const candidate of [",", ";", "\t", "|"]) {
    const count = firstLine.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

export function readDelimited(text: string, name: string): Sheet {
  const delimiter = sniffDelimiter(text)
  const records: string[][] = []
  let record: string[] = []
  let field = ""
  let quoted = false

  for (let i = 0; i < text.length && records.length <= MAX_ROWS; i++) {
    const character = text[i]!
    if (quoted) {
      if (character !== '"') field += character
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (character === '"' && field === "") quoted = true
    else if (character === delimiter) {
      record.push(field)
      field = ""
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") i++
      record.push(field)
      records.push(record)
      record = []
      field = ""
    } else field += character
  }
  if (field !== "" || record.length > 0) records.push([...record, field])

  const truncated = records.length > MAX_ROWS
  const kept = records.slice(0, MAX_ROWS)
  const columnCount = Math.min(MAX_COLUMNS, Math.max(0, ...kept.map((row) => row.length)))

  const widths = Array.from({ length: columnCount }, (_, c) => {
    let longest = 0
    for (const row of kept.slice(0, 200)) longest = Math.max(longest, row[c]?.length ?? 0)
    return Math.min(320, Math.max(DEFAULT_COLUMN_WIDTH, longest * 7 + 16))
  })

  return {
    name,
    widths,
    heights: [],
    rows: kept.map((row) =>
      row.slice(0, columnCount).map((text) => (text === "" ? undefined : { text, raw: text })),
    ),
    truncated: truncated || records.some((row) => row.length > MAX_COLUMNS),
  }
}

type Selection = { address: string; raw: string }

/**
 * The grid itself. Memoised and told about selection through the DOM rather
 * than through props, because a click should not redraw a thousand rows to
 * move one outline.
 */
const SheetGrid = React.memo(function SheetGrid({
  sheet,
  onSelect,
}: {
  sheet: Sheet
  onSelect: (selection: Selection) => void
}) {
  const table = React.useRef<HTMLTableElement>(null)
  const selected = React.useRef<HTMLTableCellElement | null>(null)

  const rowCount = Math.max(sheet.rows.length + 5, MIN_ROWS)
  const columnCount = Math.max(sheet.widths.length + 1, MIN_COLUMNS)
  const widths = Array.from(
    { length: columnCount },
    (_, c) => sheet.widths[c] ?? DEFAULT_COLUMN_WIDTH,
  )
  const gutter = 44

  const select = React.useCallback(
    (cell: HTMLTableCellElement) => {
      const r = (cell.parentElement as HTMLTableRowElement).rowIndex - 1
      const c = Number(cell.dataset.c)
      selected.current?.removeAttribute("data-selected")
      cell.setAttribute("data-selected", "")
      selected.current = cell
      onSelect({
        address: `${columnName(c)}${r + 1}`,
        raw: sheet.rows[r]?.[c]?.raw ?? "",
      })
    },
    [onSelect, sheet],
  )

  // A sheet opens with its first cell selected, as it does anywhere else.
  React.useEffect(() => {
    const first = table.current?.querySelector<HTMLTableCellElement>("td")
    if (first) select(first)
  }, [select])

  return (
    <table
      ref={table}
      onClick={(event) => {
        const cell = (event.target as HTMLElement).closest("td")
        if (cell) select(cell)
      }}
      style={{ width: gutter + widths.reduce((sum, width) => sum + width, 0) }}
      className={cn(
        "table-fixed border-separate border-spacing-0 bg-white text-xs text-black select-none",
        "[&_td]:h-5 [&_td]:cursor-cell [&_td]:overflow-hidden [&_td]:border-r [&_td]:border-b [&_td]:border-neutral-200 [&_td]:px-1 [&_td]:align-bottom [&_td]:whitespace-nowrap",
        "[&_td[data-selected]]:outline-2 [&_td[data-selected]]:-outline-offset-2 [&_td[data-selected]]:outline-emerald-700",
        "[&_th]:border-r [&_th]:border-b [&_th]:border-neutral-300 [&_th]:bg-neutral-100 [&_th]:font-normal [&_th]:text-neutral-600",
      )}
    >
      <colgroup>
        <col style={{ width: gutter }} />
        {widths.map((width, c) => (
          <col key={c} style={{ width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-20 h-5" />
          {widths.map((_, c) => (
            <th key={c} className="sticky top-0 z-10">
              {columnName(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_, r) => (
          <tr key={r} style={sheet.heights[r] ? { height: sheet.heights[r] } : undefined}>
            <th className="sticky left-0 z-10">{r + 1}</th>
            {widths.map((_, c) => {
              const cell = sheet.rows[r]?.[c]
              if (cell?.covered) return null
              return (
                <td
                  key={c}
                  data-c={c}
                  colSpan={cell?.colSpan}
                  rowSpan={cell?.rowSpan}
                  style={cell?.style}
                >
                  {cell?.text}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
})

export function SheetViewer({ sheets, className }: { sheets: Sheet[]; className?: string }) {
  const [active, setActive] = React.useState(0)
  const [selection, setSelection] = React.useState<Selection>({ address: "", raw: "" })
  const sheet = sheets[active]

  if (!sheet) {
    return <p className="text-ink-03 p-4 text-sm">This workbook has no sheets to show.</p>
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="bg-tint-01 flex h-8 shrink-0 items-center border-b font-mono text-xs">
        <span className="text-ink-03 w-16 shrink-0 border-r px-3">{selection.address}</span>
        <span className="text-ink-02 shrink-0 px-3 italic" aria-hidden>
          fx
        </span>
        <span className="text-ink-04 min-w-0 flex-1 truncate pr-3" title={selection.raw}>
          {selection.raw}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {/* Keyed so a change of sheet starts from a fresh grid and selection. */}
        <SheetGrid key={active} sheet={sheet} onSelect={setSelection} />
      </div>

      {sheet.truncated ? (
        <p className="text-ink-03 shrink-0 border-t px-3 py-1.5 text-xs">
          Showing the first {MAX_ROWS.toLocaleString()} rows and {MAX_COLUMNS} columns. Download
          the file for the rest.
        </p>
      ) : null}

      {sheets.length > 1 ? (
        <div
          role="tablist"
          aria-label="Sheets"
          className="bg-tint-01 flex shrink-0 items-center gap-1 overflow-x-auto border-t px-2 py-1"
        >
          {sheets.map((entry, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={cn(
                "text-ink-03 hover:bg-tint-02 hover:text-ink-04 h-6 shrink-0 rounded-md px-2.5 text-xs transition-colors",
                index === active && "bg-background text-ink-05 hover:bg-background shadow-xs",
              )}
            >
              {entry.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
