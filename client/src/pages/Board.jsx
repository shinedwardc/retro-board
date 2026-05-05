import { useState, useEffect } from 'react'
import socket from '../socket';
import { v4 as uuidv4 } from 'uuid';
import NoteColumn from '../components/NoteColumn';
import { getUserColor } from '../utility/colors';
import { DndContext } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { restrictToParentElement } from '@dnd-kit/modifiers';

const Board = ({ session, onLeave }) => {

    const { roomId, userName } = session;
    const [users, setUsers] = useState([]);
    const [notes, setNotes] = useState([]);

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setNotes(prev => {
                const oldIndex = prev.findIndex(n => n.id === active.id);
                const newIndex = prev.findIndex(n => n.id === over.id);
                const reordered = arrayMove(prev, oldIndex, newIndex);
                socket.emit('note:move', { roomId, noteIds: reordered.map(n => n.id) });
                return reordered;
            });
        }
        return;
    }

    // Set up socket event listeners and join room on component mount
    useEffect(() => {
        socket.connect();
        // Emit join event to server
        socket.emit('room:join', { roomId, userName });

        socket.on('room:state', ({ notes, users }) => {
            setNotes(notes);
            setUsers(users);
        });

        socket.on('user:joined', ({ userName }) => {
            setUsers(prev => prev.includes(userName) ? prev : [...prev, userName])
        });
        socket.on('user:left', ({ userName }) => {
            setUsers(prevUsers => prevUsers.filter(user => user !== userName));
        });

        socket.on('note:created', (note) => setNotes(prevNotes => [...prevNotes, note]));
        socket.on('note:updated', ({ noteId, updatedContent }) => setNotes(prevNotes => prevNotes.map(note => note.id === noteId ? { ...note, content: updatedContent } : note)));
        socket.on('note:voted', ({ noteId, votes }) => {
            setNotes(prevNotes => prevNotes.map(note => note.id === noteId ? { ...note, votes } : note))
        });
        socket.on('note:deleted', ({ noteId }) => setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId)));
        socket.on('note:moved', (updatedNotes) => setNotes(updatedNotes));

        return () => {
            socket.off('room:state');
            socket.off('user:joined');
            socket.off('user:left');
            socket.off('note:created');
            socket.off('note:updated');
            socket.off('note:voted');
            socket.off('note:deleted');
            socket.disconnect();
        }

    }, [roomId, userName]);

    const createNote = (input, category) => {
        socket.emit('note:create', { roomId, note: { 
            id: uuidv4(), 
            content: input.trim(), 
            category: category,
            author: userName,
            votes: []
        }});
    }

    const voteNote = (noteId) => {
        socket.emit('note:vote', { roomId, noteId });
    }

    const updateNote = (noteId, updatedContent) => {
        socket.emit('note:update', { roomId, noteId, updatedContent });
    }

    const deleteNote = (noteId) => {
        socket.emit('note:delete', { roomId, noteId });
    }


    return (
        <DndContext onDragEnd={handleDragEnd} modifiers={[restrictToParentElement]}>
            <div className="h-screen bg-yellow-50 p-6 flex flex-col">
            {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="grid grid-flow-col gap-x-4 items-center">
                        <h1 className="text-xl font-bold text-gray-800">
                            Retro Board
                        </h1>
                        <p className="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded-lg">
                            Room: <span className="font-mono">{roomId}</span>
                        </p>
                    </div>
                    <div className="grid grid-flow-col gap-x-4 items-center">
                        {users && users.length > 0 ? 
                        (
                            <div className="flex flex-row px-2 py-1 rounded-lg items-center">
                                <div className="flex flex-row gap-x-0.75">
                                    {users.map((user, index) => (
                                        <p key={index} className={`w-8 h-8 flex items-center justify-center text-xs text-white rounded-full p-2`} style={{ backgroundColor: getUserColor(user) }}>
                                            {user[0].toUpperCase()}
                                        </p>
                                    ))}
                                </div>
                                <h3 className="ml-2">{users.length} {users.length === 1 ? 'person' : 'people'} online</h3>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">No one else is here</p>
                        )}
                        <button onClick={() => navigator.clipboard.writeText(roomId)} className="text-sm text-white p-2 bg-gray-500 rounded-lg hover:bg-gray-800">
                            Copy ID
                        </button>
                        <button onClick={onLeave} className="text-sm text-white p-2 bg-gray-500 rounded-lg hover:bg-gray-800">
                            Leave
                        </button>
                    </div>
                </div>

                {/* Notes grid */}
                <div className="flex justify-center w-full">
                    <div className="grid grid-cols-3 gap-x-4 w-full max-w-6xl">
                        <NoteColumn notes={notes.filter(note => note.category === 'positive')} category="positive" voteNote={voteNote} createNote={createNote} updateNote={updateNote} deleteNote={deleteNote} userName={userName} />
                        <NoteColumn notes={notes.filter(note => note.category === 'negative')} category="negative" voteNote={voteNote} createNote={createNote} updateNote={updateNote} deleteNote={deleteNote} userName={userName} />
                        <NoteColumn notes={notes.filter(note => note.category === 'action')} category="action" voteNote={voteNote} createNote={createNote} updateNote={updateNote} deleteNote={deleteNote} userName={userName} />
                    </div>
                </div>
            </div>
        </DndContext>
    )
}

export default Board;