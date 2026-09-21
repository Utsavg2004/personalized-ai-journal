import { useState, useEffect } from 'react';
import { api } from '../services/api';

export const JournalForm = ({ journal, onSave, onCancel }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (journal) {
      setTitle(journal.title || '');
      setContent(journal.content || '');
    } else {
      setTitle('');
      setContent('');
    }
    setError('');
  }, [journal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      let savedJournal;
      if (journal?.id) {
        savedJournal = await api.patch(`/journals/${journal.id}`, { title, content });
      } else {
        savedJournal = await api.post('/journals', { title, content });
        setTitle('');
        setContent('');
      }
      onSave(savedJournal);
    } catch (err) {
      setError(err.message || 'Failed to save journal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="journal-form">
      <h3>{journal ? 'Edit Entry' : 'New Entry'}</h3>
      {error && <div className="error-banner">{error}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input 
            type="text" 
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="title-input"
          />
        </div>
        
        <div className="form-group">
          <textarea 
            placeholder="Write your thoughts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            className="content-input"
            rows={15}
          />
        </div>
        
        <div className="form-actions">
          <button type="button" onClick={onCancel} className="secondary-button" disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      </form>
    </div>
  );
};
