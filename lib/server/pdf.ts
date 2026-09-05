import { calculateKpiProgress } from '../domain/calculations';
import type { State } from '../types';

type ReportState = Pick<
  State,
  'packages' | 'openingBalances' | 'submissions' | 'settings'
>;

const PAGE_W = 595;
const PAGE_H = 842;
const encoder = new TextEncoder();

function safe(value: unknown) {
  return String(value)
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('Ø', 'Dia. ')
    .replaceAll('×', 'x')
    .replaceAll('≈', '~')
    .replace(/[^\x20-\x7e]/g, '')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function text(value: unknown, x: number, y: number, size = 10, bold = false, color = '0.12 0.16 0.13') {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg ${x} ${y} Td (${safe(value)}) Tj ET\n`;
}
function rect(x: number, y: number, width: number, height: number, color: string) {
  return `${color} rg ${x} ${y} ${width} ${height} re f\n`;
}
function line(x1: number, y1: number, x2: number, y2: number, color = '0.88 0.91 0.89') {
  return `${color} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}
function wrap(value: string, max = 48) {
  const words = safe(value).split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > max) {
      lines.push(current);
      current = word;
    } else current = (current + ' ' + word).trim();
  }
  if (current) lines.push(current);
  return lines;
}

export function buildProgressPdf(state: ReportState, generatedAt = new Date()) {
  const result = calculateKpiProgress(
    state.packages,
    state.openingBalances,
    state.submissions,
    state.settings!,
  );
  const pending = state.submissions.filter((item) => item.status === 'WAITING').length;
  const pages: string[] = [];

  let cover = rect(0, 0, PAGE_W, PAGE_H, '0.97 0.98 0.97');
  cover += rect(0, 650, PAGE_W, 192, '0.03 0.36 0.22');
  cover += text('TREE TRANSLOCATION PROJECT', 48, 780, 12, true, '1 1 1');
  cover += text('Project Control', 48, 728, 30, true, '1 1 1');
  cover += text('Progress Report', 48, 688, 30, true, '1 1 1');
  cover += text('EXECUTIVE SUMMARY', 48, 602, 11, true, '0.03 0.36 0.22');
  const summaries = [
    ['Overall Project Progress', `${result.overall.toFixed(2)}%`],
    ['Remaining Progress', `${result.remaining.toFixed(2)}%`],
    ['Pending Approvals', String(pending)],
  ];
  summaries.forEach(([label, value], index) => {
    const x = 48 + index * 170;
    cover += rect(x, 482, 154, 92, index === 0 ? '0.03 0.46 0.27' : '1 1 1');
    cover += text(label, x + 14, 548, 9, true, index === 0 ? '1 1 1' : '0.3 0.36 0.32');
    cover += text(value, x + 14, 507, 25, true, index === 0 ? '1 1 1' : '0.07 0.1 0.08');
  });
  cover += text('Report date', 48, 420, 9, true);
  cover += text(generatedAt.toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' }), 48, 400, 12);
  cover += text('Generated', 250, 420, 9, true);
  cover += text(generatedAt.toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' }) + ' Asia/Riyadh', 250, 400, 12);
  cover += text('Official progress includes approved opening balances, approved site submissions,', 48, 320, 10);
  cover += text('and signed approved adjustments. Waiting, returned and rejected work is excluded.', 48, 302, 10);
  pages.push(cover);

  let groups = text('MAIN ACTIVITY PROGRESS', 42, 790, 16, true, '0.03 0.36 0.22');
  groups += text('All weights are direct percentages of the whole project.', 42, 770, 9);
  let y = 718;
  for (const group of result.groups) {
    groups += text(group.name, 42, y, 11, true);
    groups += text(`Weight ${group.weight.toFixed(2)}%  |  Completion ${group.progress.toFixed(2)}%  |  Earned ${group.earned.toFixed(4)}%`, 42, y - 18, 9);
    groups += rect(42, y - 38, 500, 9, '0.9 0.93 0.91');
    groups += rect(42, y - 38, 5 * Math.min(100, group.progress), 9, '0.03 0.46 0.27');
    y -= 82;
  }
  pages.push(groups);

  const rows = result.groups.flatMap((group) =>
    group.activities.map((activity) => ({ group: group.name, ...activity })),
  );
  let page = '';
  let rowY = 0;
  let pageNumber = 2;
  const startDetailPage = () => {
    page = text('DETAILED APPROVED KPI PROGRESS', 32, 800, 14, true, '0.03 0.36 0.22');
    page += rect(30, 756, 535, 24, '0.91 0.96 0.93');
    page += text('KPI', 36, 764, 8, true);
    page += text('Target', 304, 764, 8, true);
    page += text('Progress', 365, 764, 8, true);
    page += text('Remain.', 426, 764, 8, true);
    page += text('Weight', 482, 764, 8, true);
    page += text('Earned', 530, 764, 8, true);
    rowY = 735;
  };
  startDetailPage();
  let previousGroup = '';
  for (const row of rows) {
    const lines = wrap(row.name, 44);
    const height = Math.max(33, lines.length * 11 + 18);
    if (rowY - height < 55) {
      page += text(`Project Control Progress Report  |  Page ${pageNumber++}`, 32, 25, 8, false, '0.45 0.5 0.47');
      pages.push(page);
      startDetailPage();
      previousGroup = '';
    }
    if (row.group !== previousGroup) {
      page += text(row.group, 36, rowY, 8, true, '0.03 0.36 0.22');
      rowY -= 18;
      previousGroup = row.group;
    }
    lines.forEach((value, index) => { page += text(value, 36, rowY - index * 11, 8, index === 0); });
    const final = row.id === 'kpi-final-handover';
    page += text(final ? 'Binary' : row.target.toLocaleString('en-US'), 304, rowY, 8);
    page += text(final ? (row.quantity >= 1 ? 'Completed' : 'Not completed') : row.quantity.toLocaleString('en-US'), 365, rowY, 8);
    page += text(final ? (row.remaining === 0 ? 'Done' : 'Pending') : row.remaining.toLocaleString('en-US'), 426, rowY, 8);
    page += text(`${row.weight}%`, 482, rowY, 8);
    page += text(`${row.earned.toFixed(4)}%`, 530, rowY, 8);
    rowY -= height;
    page += line(30, rowY + 8, 565, rowY + 8);
  }
  page += text(`Project Control Progress Report  |  Page ${pageNumber}`, 32, 25, 8, false, '0.45 0.5 0.47');
  pages.push(page);

  let activity = text('SITE & APPROVAL SUMMARY', 42, 790, 16, true, '0.03 0.36 0.22');
  activity += text(`Approved: ${state.submissions.filter((item) => item.status === 'APPROVED').length}`, 42, 750, 11, true);
  activity += text(`Waiting: ${pending}`, 180, 750, 11, true);
  activity += text(`Returned: ${state.submissions.filter((item) => item.status === 'RETURNED').length}`, 300, 750, 11, true);
  activity += text(`Rejected: ${state.submissions.filter((item) => item.status === 'REJECTED').length}`, 430, 750, 11, true);
  activity += text('Recent submissions', 42, 700, 11, true);
  y = 670;
  for (const submission of state.submissions.slice(0, 12)) {
    const location = submission.blockId ? ` | Block ${submission.blockId}` : '';
    activity += text(`${submission.workDate.slice(0, 10)} | ${submission.supervisor.name}${location} | ${submission.status}`, 42, y, 9);
    y -= 24;
  }
  if (!state.submissions.length) activity += text('No site submissions have been recorded.', 42, y, 10);
  pages.push(activity);

  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  pages.forEach((content, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const pageContent = content +
      text(`TREE TRANSLOCATION PROJECT  |  Page ${index + 1} of ${pages.length}`, 390, 18, 7, false, '0.45 0.5 0.47');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${encoder.encode(pageContent).length} >>\nstream\n${pageContent}endstream`;
  });
  let output = '%PDF-1.7\n%TREE-CONTROL\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = encoder.encode(output).length;
    output += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = encoder.encode(output).length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1)
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(output);
}
