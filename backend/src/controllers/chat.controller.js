import { z } from 'zod';
import { answerQuestion } from '../services/rag.service.js';
import { saveConversationMessage } from '../services/conversation.service.js';
import { BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Schema for input validation
const chatSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  message: z.string().min(1, "Message cannot be empty").max(2000, "Message is too long"),
});

export const handleChat = async (req, res, next    ) => {
  try {
    const userId = req.user.id; // derived from authenticated session

    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid chat input: ' + parsed.error.issues[0].message);
    }

    const { conversationId, message } = parsed.data;

    logger.rag('chat_request', { userId, conversationId: conversationId ?? 'new', query: message });

    // Execute the RAG pipeline
    const { answer, sources } = await answerQuestion({
      userId,
      question: message,
    });

    // Save conversation state (and implicitly validates conversationId ownership)
    const activeConversationId = await saveConversationMessage({
      userId,
      conversationId: conversationId || null,
      message,
      answer,
      sources,
    });

    res.status(200).json({
      answer,
      sources,
      conversationId: activeConversationId,
    });
  } catch (err) {
    next(err);
  }
};
