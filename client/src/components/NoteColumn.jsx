import { useState } from 'react'
import NoteCard  from './NoteCard';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

const NoteColumn = ({ notes, category, voteNote, createNote, updateNote, deleteNote, userName }) => {

    const [input, setInput] = useState('');

    const { setNodeRef } = useDroppable({
        id: category,
    });


    return (
        <div className="flex flex-col h-full">
            {/* Column header */}
            <div className="flex items-center justify-center mb-2">
                <h2 className="text-lg text-center font-bold text-gray-800">
                    {category === 'positive' ? 'What went well' : category === 'negative' ? 'What to improve' : 'Action Items'}
                </h2>
            </div>
            {/* Input and add button */}
            <div className="flex flex-col gap-y-4 flex-1 p-3 bg-gray-300 rounded-xl overlflow-hidden">
                {/* Input */}
                <div className="flex flex-row gap-x-2 max-w-sm">
                    <input
                        className="flex-1 border rounded-lg px-4 py-2 text-sm bg-white"
                        placeholder="Add note..."
                        value={input}
                        onChange={e => {
                            setInput(e.target.value)
                        }}
                    />
                    <button
                        onClick={() => {
                            createNote(input, category)
                            setInput('');
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                        +
                    </button>
                </div>
                {/* Notes list */}
                <div ref={setNodeRef} className="flex flex-col gap-y-2 overflow-y-auto h-[60vh]">
                    <SortableContext
                        items={notes.map(note => note.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {notes.map(note => (
                            <NoteCard
                                key={note.id}
                                note={note} 
                                voteNote={voteNote} 
                                updateNote={updateNote}
                                deleteNote={deleteNote} 
                                userName={userName} 
                            />
                        ))}
                    </SortableContext>
                </div>
            </div>

        </div>
    )
}

export default NoteColumn;
