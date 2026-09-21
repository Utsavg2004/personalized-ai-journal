import { useState } from 'react';
import { api } from '../services/api';

export const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.post('/chat', {
        message: userMessage.content,
        conversationId: conversationId
      });

      setConversationId(response.conversationId);
      
      const assistantMessage = {
        role: 'assistant',
        content: response.answer,
        sources: response.sources || []
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, isError: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h3>AI Assistant</h3>
        <p>Ask questions about your journal entries</p>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">No messages yet. Ask something about your past entries!</div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role} ${msg.isError ? 'error' : ''}`}>
            <div className="message-content">
              <strong>{msg.role === 'user' ? 'You' : 'AI'}</strong>
              <p>{msg.content}</p>
              
              {msg.sources && msg.sources.length > 0 && (
                <div className="sources-container">
                  <small>Sources:</small>
                  <ul>
                    {msg.sources.map((src, i) => (
                      <li key={i}>
                        Journal: "{src.title || src.journalId}" (sim: {Math.round(src.similarity * 100)}%)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && <div className="loading-indicator">AI is thinking...</div>}
      </div>

      <form onSubmit={handleSend} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};
