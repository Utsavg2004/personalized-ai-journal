import * as journalService from '../services/journal.service.js';

export const createJournalHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title, content } = req.body;
    const journal = await journalService.createJournal({ userId, title, content });
    res.status(201).json({ data: journal });
  } catch (err) {
    next(err);
  }
};

export const listJournalsHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 10;
    const { items, total } = await journalService.listJournals({ userId, page, pageSize });

    res.status(200).json({
      data: items,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getJournalByIdHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const journal = await journalService.getJournalById({ userId, id });
    res.status(200).json({ data: journal });
  } catch (err) {
    next(err);
  }
};

export const updateJournalHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const journal = await journalService.updateJournal({ userId, id, updates: req.body });
    res.status(200).json({ data: journal });
  } catch (err) {
    next(err);
  }
};

export const deleteJournalHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await journalService.deleteJournal({ userId, id });
    res.status(200).json({ message: 'Journal deleted successfully' });
  } catch (err) {
    next(err);
  }
};
