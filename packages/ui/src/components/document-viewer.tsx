"use client"

/**
 * A document shown as what it is: a Word file as pages, a workbook as a grid,
 * a PDF in the browser's own reader, an image as an image.
 *
 * It is handed a URL and works the rest out from the bytes that come back, so
 * the same component serves anything that can answer with a file.
 */
import * as React from "react"
import { cn } from "cn"
import { Streamdown } from "streamdown"

import { Spinner } from "@onirix/ui/components/spinner"
import { readDelimited, readWorkbook, SheetViewer, type Sheet } from "@onirix/ui/components/sheet-viewer"

type Kind = "pdf" | "docx" | "sheet" | "delimited" | "image" | "markdown" | "html" | "text"

const KIND_BY_MIME: Record<string, Kind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
  "application/vnd.ms-excel": "sheet",
  "application/vnd.oasis.opendocument.spreadsheet": "sheet",
  "text/csv": "delimited",
  "text/tab-separated-values": "delimited",
  "text/markdown": "markdown",
  "text/html": "html",
  "application/json": "text",
}

const KIND_BY_EXTENSION: Record<string, Kind> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "sheet",
  xlsm: "sheet",
  xlsb: "sheet",
  xls: "sheet",
  ods: "sheet",
  csv: "delimited",
  tsv: "delimited",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  txt: "text",
  json: "text",
  log: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  svg: "image",
}

/**
 * The reported type first, then the name. A connector often reports nothing
 * better than "a file", and the extension is the only thing left to go on.
 */
function kindOf(mimeType: string, title: string): Kind | null {
  const mime = mimeType.split(";")[0]!.trim().toLowerCase()
  const extension = title.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]

  const known = KIND_BY_MIME[mime] ?? (extension ? KIND_BY_EXTENSION[extension] : undefined)
  if (known) return known
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("text/")) return "text"
  return null
}

/** Past this a text file is cut: a browser lays out every character it is given. */
const MAX_TEXT_CHARACTERS = 500_000

type Loaded =
  | { kind: "pdf" | "image" | "docx"; blob: Blob }
  | { kind: "sheet" | "delimited"; sheets: Sheet[] }
  | { kind: "markdown" | "html" | "text"; text: string; clipped: boolean }
  | { kind: "unsupported" }

type State =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | ({ status: "ready" } & Loaded)

async function load(src: string, title: string, signal: AbortSignal): Promise<Loaded> {
  const response = await fetch(src, { signal })
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "This document is no longer available."
        : "The document could not be loaded.",
    )
  }

  const blob = await response.blob()
  const kind = kindOf(blob.type, title)

  switch (kind) {
    case null:
      return { kind: "unsupported" }
    case "pdf":
      // The reader is chosen by the blob's type, which a vague upstream type
      // would otherwise leave as a download.
      return { kind, blob: new Blob([blob], { type: "application/pdf" }) }
    case "image":
    case "docx":
      return { kind, blob }
    case "sheet":
      return { kind, sheets: await readWorkbook(await blob.arrayBuffer()) }
    case "delimited":
      return { kind, sheets: [readDelimited(await blob.text(), title)] }
    default: {
      let text = await blob.text()
      if (kind === "text" && title.toLowerCase().endsWith(".json")) {
        try {
          text = JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          // Shown as it was written.
        }
      }
      return {
        kind,
        text: text.slice(0, MAX_TEXT_CHARACTERS),
        clipped: text.length > MAX_TEXT_CHARACTERS,
      }
    }
  }
}

export function DocumentViewer(props: { src: string; title: string; className?: string }) {
  // Keyed on the source, so moving to another document starts clean rather
  // than showing the last one while the next loads.
  return <Viewer key={props.src} {...props} />
}

function Viewer({ src, title, className }: { src: string; title: string; className?: string }) {
  const [state, setState] = React.useState<State>({ status: "loading" })

  React.useEffect(() => {
    const controller = new AbortController()
    load(src, title, controller.signal).then(
      (loaded) => setState({ status: "ready", ...loaded }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: "failed",
          message:
            error instanceof Error && error.message
              ? error.message
              : "The document could not be loaded.",
        })
      },
    )
    return () => controller.abort()
  }, [src, title])

  if (state.status === "loading") {
    return (
      <div className={cn("text-ink-03 flex flex-1 items-center justify-center gap-2 text-sm", className)}>
        <Spinner />
        Opening
      </div>
    )
  }

  if (state.status === "failed") {
    return (
      <p role="alert" className={cn("text-ink-03 p-4 text-sm leading-6", className)}>
        {state.message}
      </p>
    )
  }

  switch (state.kind) {
    case "pdf":
      return <PdfView blob={state.blob} title={title} className={className} />
    case "image":
      return <ImageView blob={state.blob} title={title} className={className} />
    case "docx":
      return <DocxView blob={state.blob} className={className} />
    case "sheet":
    case "delimited":
      return <SheetViewer sheets={state.sheets} className={className} />
    case "markdown":
      return (
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-6 text-sm leading-6", className)}>
          <Streamdown mode="static">{state.text}</Streamdown>
          <Clipped show={state.clipped} />
        </div>
      )
    case "html":
      return (
        // No `allow-scripts` and no `allow-same-origin`: the file is someone's
        // upload, so it is laid out and nothing more.
        <iframe
          title={title}
          sandbox=""
          srcDoc={state.text}
          className={cn("min-h-0 w-full flex-1 bg-white", className)}
        />
      )
    case "text":
      return (
        <div className={cn("min-h-0 flex-1 overflow-auto p-4", className)}>
          <pre className="text-ink-04 font-mono text-xs leading-5 whitespace-pre-wrap">
            {state.text}
          </pre>
          <Clipped show={state.clipped} />
        </div>
      )
    case "unsupported":
      return (
        <p className={cn("text-ink-03 p-4 text-sm leading-6", className)}>
          There is no preview for this kind of file.{" "}
          <a href={src} download className="text-info hover:underline">
            Download it
          </a>{" "}
          to open it.
        </p>
      )
  }
}

function Clipped({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <p className="text-ink-03 mt-4 border-t pt-3 text-xs">
      This is the start of a long file. Download it for the rest.
    </p>
  )
}

function useObjectUrl(blob: Blob): string | null {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    const created = URL.createObjectURL(blob)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [blob])
  return url
}

function PdfView({ blob, title, className }: { blob: Blob; title: string; className?: string }) {
  const url = useObjectUrl(blob)
  if (!url) return null
  // The browser's own reader: paging, zoom, search and text selection, with
  // nothing to ship. It opens fitted to the width of the pane.
  return <iframe title={title} src={`${url}#view=FitH`} className={cn("min-h-0 w-full flex-1", className)} />
}

function ImageView({ blob, title, className }: { blob: Blob; title: string; className?: string }) {
  const url = useObjectUrl(blob)
  return (
    <div className={cn("bg-tint-01 flex min-h-0 flex-1 overflow-auto p-4", className)}>
      {url ? <img src={url} alt={title} className="m-auto max-w-full rounded-sm shadow-sm" /> : null}
    </div>
  )
}

const PAGE_GUTTER = 32

/**
 * Pages at their real size, scaled down to the width of the pane.
 *
 * A Word file fixes its page width, margins and tab stops in absolute units,
 * so reflowing it to fit would stop it looking like itself. Scaling keeps the
 * layout the author made at whatever width the reader has dragged the pane to.
 */
function DocxView({ blob, className }: { blob: Blob; className?: string }) {
  const frame = React.useRef<HTMLDivElement>(null)
  const pages = React.useRef<HTMLDivElement>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    const frameElement = frame.current
    const pagesElement = pages.current
    if (!frameElement || !pagesElement) return

    let cancelled = false
    let observer: ResizeObserver | undefined

    void (async () => {
      try {
        const { renderAsync } = await import("docx-preview")
        if (cancelled) return
        pagesElement.replaceChildren()
        // Measured below at full size, so any earlier scale has to go first.
        pagesElement.style.zoom = "1"
        await renderAsync(blob, pagesElement, undefined, {
          // The grey desk and page shadows are drawn here instead, in the
          // app's own colours.
          inWrapper: false,
          ignoreLastRenderedPageBreak: false,
        })
        if (cancelled) return

        let natural = 0
        for (const page of pagesElement.querySelectorAll<HTMLElement>("section.docx")) {
          natural = Math.max(natural, page.offsetWidth)
        }
        if (natural === 0) return

        const fit = () => {
          const available = frameElement.clientWidth - PAGE_GUTTER
          pagesElement.style.zoom = String(Math.min(1, available / natural))
        }
        fit()
        observer = new ResizeObserver(fit)
        observer.observe(frameElement)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [blob])

  if (failed) {
    return (
      <p role="alert" className={cn("text-ink-03 p-4 text-sm leading-6", className)}>
        This document could not be drawn. Download it to open it.
      </p>
    )
  }

  return (
    <div ref={frame} className={cn("bg-tint-01 min-h-0 flex-1 overflow-auto py-4", className)}>
      <div
        ref={pages}
        className="mx-auto w-fit [&_section.docx]:mb-4 [&_section.docx]:bg-white [&_section.docx]:text-black [&_section.docx]:shadow-md"
      />
    </div>
  )
}
