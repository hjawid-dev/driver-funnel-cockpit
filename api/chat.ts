import { createChatHandler } from '../src/lib/chat/server.js';

/**
 * POST /api/chat: the driver assistant. The logic and its tests live in src/lib/chat.
 * ANTHROPIC_API_KEY is set in the Vercel project settings; CHAT_ENABLED=off switches the AI off.
 */
const handle = createChatHandler({ env: process.env });

export default {
  fetch: handle,
};
