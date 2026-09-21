import { NotFoundError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  insertConversation,
  selectConversationForUser,
  insertMessages,
} from '../repositories/conversation.repository.js';

/**
 * Resolves the active conversation for a chat turn -- creating a new one
 * (with a real, DB-generated id) when the caller didn't supply one -- then
 * persists the user/assistant messages against it. Never returns a mocked
 * or client-invented id.
 *
 * A supplied `conversationId` must already belong to `userId`; ownership is
 * enforced by scoping the lookup itself (see
 * conversation.repository.js#selectConversationForUser), so a mismatched
 * owner surfaces as a 404, identical to an unknown id -- this avoids
 * confirming to a non-owner that a given conversation id even exists.
 */
export const saveConversationMessage = async ({ userId, conversationId, message, answer, sources }) => {
  if (env.ENABLE_CONVERSATION_HISTORY === 'false') {
    return conversationId;
  }

  let activeConversationId = conversationId;

  if (activeConversationId) {
    const owned = await selectConversationForUser({ userId, id: activeConversationId });
    if (!owned) {
      throw new NotFoundError('Conversation');
    }
  } else {
    const conversation = await insertConversation({ userId });
    activeConversationId = conversation.id;
  }

  await insertMessages([
    { conversationId: activeConversationId, userId, role: 'user', content: message },
    { conversationId: activeConversationId, userId, role: 'assistant', content: answer, sources },
  ]);

  logger.rag('conversation_resolved', { userId, conversationId: activeConversationId });

  return activeConversationId;
};
