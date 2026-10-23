import { createReportHandler } from '../src/lib/report/server.js';

/**
 * POST /api/report: the weekly report. Logic and tests live in src/lib/report.
 * Uses the same ANTHROPIC_API_KEY and CHAT_ENABLED switch as the chat.
 */
const handle = createReportHandler({ env: process.env });

export default {
  fetch: handle,
};
