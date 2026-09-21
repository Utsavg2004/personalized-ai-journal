import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.middleware.js';
import {
  createJournalSchema,
  updateJournalSchema,
  journalIdParamSchema,
  journalQuerySchema,
} from '../validators/journal.validator.js';
import {
  createJournalHandler,
  listJournalsHandler,
  getJournalByIdHandler,
  updateJournalHandler,
  deleteJournalHandler,
} from '../controllers/journal.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', validateBody(createJournalSchema), createJournalHandler);
router.get('/', validateQuery(journalQuerySchema), listJournalsHandler);
router.get('/:id', validateParams(journalIdParamSchema), getJournalByIdHandler);
router.patch(
  '/:id',
  validateParams(journalIdParamSchema),
  validateBody(updateJournalSchema),
  updateJournalHandler
);
router.delete('/:id', validateParams(journalIdParamSchema), deleteJournalHandler);

export default router;
