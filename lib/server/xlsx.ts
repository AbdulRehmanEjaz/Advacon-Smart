import { strToU8, zipSync } from 'fflate';
import type { AttendanceRecord, Resource } from '@/lib/domain/attendance';
import { statusCounts } from '@/lib/domain/attendance';
import type { State } from '@/lib/types';

const xml = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char]!,
  );
const column = (number: number) => {
  let result = '';
  for (let value = number; value; value = Math.floor((value - 1) / 26))
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
};
const inline = (ref: string, value: string | number, style = 6) =>
  `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
const numeric = (ref: string, value: number, style = 6) =>
  `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
const row = (number: number, cells: string[], height?: number) =>
  `<row r="${number}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells.join('')}</row>`;

function monthDays(month: string) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

function monthTitle(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function statusByDay(
  records: AttendanceRecord[],
  resourceId: string,
  month: string,
  today: string,
) {
  return new Map(
    records
      .filter(
        (item) =>
          item.resourceId === resourceId &&
          item.date.startsWith(month) &&
          item.date <= today,
      )
      .map((item) => [Number(item.date.slice(8, 10)), item.status]),
  );
}

type Section = {
  title: string;
  resources: Resource[];
  attendance: AttendanceRecord[];
  totalLabel: string;
};

export function buildMonthlyTimesheetXlsx(
  state: Pick<
    State,
    'manpower' | 'equipment' | 'manpowerAttendance' | 'equipmentAttendance'
  >,
  month: string,
  today: string,
  generatedAt = new Date(),
) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('INVALID_MONTH');
  const days = monthDays(month);
  const summaryStart = 4 + days;
  const lastColumn = column(summaryStart + 5);
  const rows: string[] = [];
  const merges: string[] = [];
  let rowNumber = 1;
  const full = (text: string, style: number, height?: number) => {
    rows.push(row(rowNumber, [inline(`A${rowNumber}`, text, style)], height));
    merges.push(`A${rowNumber}:${lastColumn}${rowNumber}`);
    rowNumber++;
  };
  full('TREE TRANSLOCATION PROJECT', 1, 30);
  full('MANPOWER & EQUIPMENT MONTHLY TIMESHEET', 2, 25);
  full('Project Name: Tree Translocation Project', 3, 21);
  full(
    `Reporting month: ${monthTitle(month)}   •   Generated: ${generatedAt.toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' })} (Asia/Riyadh)`,
    3,
    22,
  );
  rowNumber++;

  const sections: Section[] = [
    {
      title: 'MANPOWER / WORKERS',
      resources: state.manpower || [],
      attendance: state.manpowerAttendance || [],
      totalLabel: 'MANPOWER TOTAL',
    },
    {
      title: 'VEHICLES & EQUIPMENT',
      resources: state.equipment || [],
      attendance: state.equipmentAttendance || [],
      totalLabel: 'VEHICLES & EQUIPMENT TOTAL',
    },
  ];
  const totals: number[] = [];
  for (const section of sections) {
    const sectionRow = rowNumber;
    full(section.title, 4, 24);
    const headers = [
      '#',
      'Name',
      'ID',
      ...Array.from({ length: days }, (_, index) => {
        const date = new Date(
          `${month}-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
        );
        return `${index + 1}\n${date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)}`;
      }),
      'P',
      'A',
      'F',
      'H',
      'Rate',
      'Total',
    ];
    rows.push(
      row(
        rowNumber,
        headers.map((value, index) =>
          inline(`${column(index + 1)}${rowNumber}`, value, 5),
        ),
        32,
      ),
    );
    rowNumber++;
    let sectionTotal = 0;
    section.resources.forEach((resource, index) => {
      const statuses = statusByDay(
        section.attendance,
        resource.id,
        month,
        today,
      );
      const applicable = [...statuses.values()].map((status, day) => ({
        id: `${resource.id}-${day}`,
        resourceId: resource.id,
        date: '',
        status,
        createdAt: '',
        updatedAt: '',
      }));
      const counts = statusCounts(applicable);
      const total = counts.P * resource.dailyRateHalalas;
      sectionTotal += total;
      const cells = [
        inline(`A${rowNumber}`, index + 1),
        inline(`B${rowNumber}`, resource.name),
        inline(`C${rowNumber}`, resource.code),
      ];
      for (let day = 1; day <= days; day++) {
        const status = statuses.get(day);
        const style =
          status === 'P'
            ? 7
            : status === 'A'
              ? 8
              : status === 'F'
                ? 9
                : status === 'H'
                  ? 10
                  : 6;
        cells.push(
          inline(`${column(day + 3)}${rowNumber}`, status || '', style),
        );
      }
      (['P', 'A', 'F', 'H'] as const).forEach((status, offset) =>
        cells.push(
          numeric(
            `${column(summaryStart + offset)}${rowNumber}`,
            counts[status],
          ),
        ),
      );
      cells.push(
        numeric(
          `${column(summaryStart + 4)}${rowNumber}`,
          resource.dailyRateHalalas / 100,
          11,
        ),
      );
      cells.push(
        numeric(`${column(summaryStart + 5)}${rowNumber}`, total / 100, 11),
      );
      rows.push(row(rowNumber, cells, 21));
      rowNumber++;
    });
    const totalRow = rowNumber;
    rows.push(
      row(
        rowNumber,
        [
          inline(`A${rowNumber}`, section.totalLabel, 13),
          numeric(`${lastColumn}${rowNumber}`, sectionTotal / 100, 12),
        ],
        23,
      ),
    );
    merges.push(`A${rowNumber}:${column(summaryStart + 4)}${rowNumber}`);
    totals.push(sectionTotal);
    rowNumber += 2;
    // Keep section rows together where possible when printing.
    void sectionRow;
    void totalRow;
  }
  full('PROJECT COST SUMMARY', 4, 24);
  rows.push(
    row(rowNumber, [
      inline(`A${rowNumber}`, 'Manpower Total', 13),
      numeric(`${lastColumn}${rowNumber}`, totals[0] / 100, 12),
    ]),
  );
  merges.push(`A${rowNumber}:${column(summaryStart + 4)}${rowNumber}`);
  rowNumber++;
  rows.push(
    row(rowNumber, [
      inline(`A${rowNumber}`, 'Equipment Total', 13),
      numeric(`${lastColumn}${rowNumber}`, totals[1] / 100, 12),
    ]),
  );
  merges.push(`A${rowNumber}:${column(summaryStart + 4)}${rowNumber}`);
  rowNumber++;
  rows.push(
    row(
      rowNumber,
      [
        inline(`A${rowNumber}`, 'GRAND TOTAL', 14),
        numeric(`${lastColumn}${rowNumber}`, (totals[0] + totals[1]) / 100, 14),
      ],
      25,
    ),
  );
  merges.push(`A${rowNumber}:${column(summaryStart + 4)}${rowNumber}`);

  const widths = [
    `<col min="1" max="1" width="5" customWidth="1"/>`,
    `<col min="2" max="2" width="28" customWidth="1"/>`,
    `<col min="3" max="3" width="15" customWidth="1"/>`,
    `<col min="4" max="${days + 3}" width="4" customWidth="1"/>`,
    `<col min="${summaryStart}" max="${summaryStart + 3}" width="5" customWidth="1"/>`,
    `<col min="${summaryStart + 4}" max="${summaryStart + 4}" width="12" customWidth="1"/>`,
    `<col min="${summaryStart + 5}" max="${summaryStart + 5}" width="15" customWidth="1"/>`,
  ].join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="3" ySplit="7" topLeftCell="D8" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode='&quot;SAR &quot;#,##0.00'/></numFmts><fonts count="5"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="15"/><name val="Aptos Display"/></font><font><b/><color rgb="FF075C38"/><sz val="12"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/></font><font><b/><color rgb="FF12251A"/><sz val="10"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF075C38"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF7F0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDF3E6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE4E1"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2D8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4F0F4"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFE4EAE6"/></left><right style="thin"><color rgb="FFE4EAE6"/></right><top style="thin"><color rgb="FFE4EAE6"/></top><bottom style="thin"><color rgb="FFE4EAE6"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="15"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="2" borderId="0" alignment="center" applyAlignment="1"/><xf fontId="2" fillId="3" borderId="0" alignment="center" applyAlignment="1"/><xf fontId="0" fillId="0" borderId="0" alignment="center" applyAlignment="1"/><xf fontId="3" fillId="2" borderId="0" alignment="left" applyAlignment="1"/><xf fontId="3" fillId="2" borderId="1" alignment="center" wrapText="1" applyAlignment="1"/><xf fontId="0" fillId="0" borderId="1" alignment="center" applyAlignment="1"/><xf fontId="4" fillId="4" borderId="1" alignment="center" applyAlignment="1"/><xf fontId="4" fillId="5" borderId="1" alignment="center" applyAlignment="1"/><xf fontId="4" fillId="6" borderId="1" alignment="center" applyAlignment="1"/><xf fontId="4" fillId="7" borderId="1" alignment="center" applyAlignment="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" alignment="right" applyNumberFormat="1" applyAlignment="1"/><xf numFmtId="164" fontId="4" fillId="3" borderId="1" alignment="right" applyNumberFormat="1" applyAlignment="1"/><xf fontId="4" fillId="3" borderId="1" alignment="left" applyAlignment="1"/><xf numFmtId="164" fontId="3" fillId="2" borderId="1" alignment="right" applyNumberFormat="1" applyAlignment="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    ),
    'docProps/core.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Monthly Timesheet</dc:title><dc:creator>Tree Control</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:created></cp:coreProperties>`,
    ),
    'docProps/app.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Tree Control</Application></Properties>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Monthly Timesheet" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="0"/></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(styles),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}
