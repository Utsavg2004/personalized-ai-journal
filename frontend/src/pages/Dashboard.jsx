import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { JournalList } from '../components/JournalList';
import { JournalForm } from '../components/JournalForm';
import { ChatInterface } from '../components/ChatInterface';

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [selectedJournal, setSelectedJournal] = useState(null);
  
  // A simple hack to force JournalList to refresh when a journal is saved
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSave = () => {
    setSelectedJournal(null);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Codeacious AI Journal</h1>
        <div className="user-controls">
          <span>{user?.email}</span>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
      </header>

      <main className="dashboard-layout">
        <section className="journal-section">
          <JournalList 
            key={refreshTrigger}
            currentJournalId={selectedJournal?.id} 
            onSelectJournal={setSelectedJournal} 
          />
          
          <div className="journal-editor-container">
            <JournalForm 
              journal={selectedJournal} 
              onSave={handleSave} 
              onCancel={() => setSelectedJournal(null)} 
            />
          </div>
        </section>
        
        <aside className="chat-section">
          <ChatInterface />
        </aside>
      </main>
    </div>
  );
};
