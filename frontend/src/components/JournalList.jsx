import { useEffect, useState } from 'react';
import { api } from '../services/api';

export const JournalList = ({ onSelectJournal, currentJournalId }) => {
  const [journals, setJournals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchJournals = async () => {
    try {
      // Assuming a GET /journals endpoint exists per standard REST
      // The instructions skipped routes for journals, but we must implement the frontend assuming they exist or will exist.
      // If they don't exist, this will just show an error.
      const data = await api.get('/journals?page=1&pageSize=50');
      setJournals(data.data || data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load journals');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJournals();
  }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    
    try {
      await api.delete(`/journals/${id}`);
      setJournals(journals.filter(j => j.id !== id));
      if (currentJournalId === id) {
        onSelectJournal(null);
      }
    } catch {
      // api client already shows an error toast
    }
  };

  if (isLoading) return <div className="loading">Loading journals...</div>;
  if (error) return <div className="error-state">{error}</div>;

  return (
    <div className="journal-list">
      <div className="list-header">
        <h3>Your Entries</h3>
        <button className="new-btn" onClick={() => onSelectJournal(null)}>+ New</button>
      </div>
      
      {journals.length === 0 ? (
        <div className="empty-state">No journals yet. Create one!</div>
      ) : (
        <ul>
          {journals.map((journal) => (
            <li 
              key={journal.id} 
              className={currentJournalId === journal.id ? 'active' : ''}
              onClick={() => onSelectJournal(journal)}
            >
              <div className="journal-summary">
                <strong>{journal.title || 'Untitled'}</strong>
                <span>{new Date(journal.createdAt).toLocaleDateString()}</span>
              </div>
              <button className="delete-btn" onClick={(e) => handleDelete(e, journal.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
