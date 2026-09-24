// 엑셀 파일 쓰기 (ExcelJS). 표 모양은 sheet.ts가 정해요.
// ExcelJS는 크기가 커서 다운로드 버튼을 누를 때만 불러와요.
import type ExcelJSType from 'exceljs'
import { COLORS, type SheetModel, type XStyle } from './sheet'

type ExcelJS = typeof ExcelJSType
const FONT = '맑은 고딕'
const argb = (hex: string) => `FF${hex}`

function applyStyle(cell: ExcelJSType.Cell, s: XStyle) {
  cell.font = { name: FONT, size: s.size ?? 9, bold: !!s.bold, color: s.color ? { argb: argb(s.color) } : undefined }
  cell.alignment = {
    horizontal: s.align ?? 'center',
    vertical: 'middle',
    wrapText: !!s.wrap || !!s.vertical,
    textRotation: s.vertical ? 'vertical' : undefined,
  }
  if (s.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(s.fill) } }
}

/** 표 모양 → 워크북 (노드 테스트에서도 그대로 써요) */
export function writeWorkbook(Excel: ExcelJS, m: SheetModel): ExcelJSType.Workbook {
  const wb = new Excel.Workbook()
  wb.creator = '근무 스케줄러'
  wb.created = new Date()
  const ws = wb.addWorksheet(m.sheetName, {
    views: [{ state: 'frozen', xSplit: m.freezeCol, ySplit: m.freezeRow, showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  })
  m.colWidths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  Object.entries(m.rowHeights).forEach(([r, h]) => (ws.getRow(Number(r)).height = h))

  // 표 테두리 (제목 아래 전체) — 월요일 열은 왼쪽 굵은 선
  const thin = { style: 'thin' as const, color: { argb: argb(COLORS.line) } }
  const week = { style: 'medium' as const, color: { argb: argb(COLORS.weekLine) } }
  const weekCols = new Set(m.weekCols)
  for (let r = m.tableTop; r <= m.rows; r++) {
    for (let c = 1; c <= m.cols; c++) {
      const cell = ws.getCell(r, c)
      cell.border = { top: thin, bottom: thin, right: thin, left: weekCols.has(c) ? week : thin }
      applyStyle(cell, {})
    }
  }
  for (const x of m.cells) {
    const cell = ws.getCell(x.r, x.c)
    cell.value = x.v === '' ? null : x.v
    applyStyle(cell, x.s)
  }
  for (const [r1, c1, r2, c2] of m.merges) ws.mergeCells(r1, c1, r2, c2)
  // 인쇄할 때 머리 행 반복
  ws.pageSetup.printTitlesRow = `${m.tableTop}:${m.freezeRow}`
  return wb
}

/** 브라우저에서 파일 받기 */
export async function downloadSheet(m: SheetModel) {
  const mod = await import('exceljs')
  const Excel = ((mod as unknown as { default?: ExcelJS }).default ?? mod) as ExcelJS
  const wb = writeWorkbook(Excel, m)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = m.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
